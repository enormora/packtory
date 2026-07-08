import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createGitHubReleaseClient, type GitHubReleaseClient } from './github-release-client.ts';

type RequestRecord = {
    readonly body: string | undefined;
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly method: string;
    readonly url: string;
};
type RequestHeaders = Headers | Readonly<Record<string, string>> | readonly (readonly [string, string])[];

function isHeaderTupleArray(headers: RequestHeaders): headers is readonly (readonly [string, string])[] {
    return Array.isArray(headers);
}

function readRequestUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') {
        return input;
    }
    if (input instanceof URL) {
        return input.href;
    }
    return input.url;
}

function toHeadersInit(headers: RequestHeaders | undefined): HeadersInit | undefined {
    if (headers === undefined || headers instanceof Headers) {
        return headers;
    }
    if (isHeaderTupleArray(headers)) {
        return headers.map(function (entry): [string, string] {
            return [ entry[0], entry[1] ];
        });
    }
    const recordHeaders: Readonly<Record<string, string>> = headers;
    return { ...recordHeaders };
}

function readRequestHeaders(headers: RequestHeaders | undefined): Readonly<Record<string, string | undefined>> {
    const parsedHeaders = new Headers(toHeadersInit(headers));
    return {
        accept: parsedHeaders.get('accept') ?? undefined,
        authorization: parsedHeaders.get('authorization') ?? undefined,
        contentType: parsedHeaders.get('content-type') ?? undefined,
        userAgent: parsedHeaders.get('user-agent') ?? undefined,
        githubApiVersion: parsedHeaders.get('x-github-api-version') ?? undefined
    };
}

type GitHubReleaseClientFixture = {
    readonly client: GitHubReleaseClient;
    readonly requests: readonly RequestRecord[];
};

function createClientWithStatuses(statuses: readonly number[]): GitHubReleaseClientFixture {
    const requests: RequestRecord[] = [];
    let requestCount = 0;
    function createResponse(): Response {
        const status = statuses[requestCount] ?? 500;
        requestCount += 1;
        return new Response('{}', { status });
    }
    function recordRequest(input: RequestInfo | URL, init: Readonly<RequestInit> | undefined): void {
        requests.push({
            url: readRequestUrl(input),
            method: init?.method ?? 'GET',
            body: typeof init?.body === 'string' ? init.body : undefined,
            headers: readRequestHeaders(init?.headers)
        });
    }
    return {
        requests,
        client: createGitHubReleaseClient({
            owner: 'owner',
            repo: 'repo',
            token: 'token',
            async fetch(input, init) {
                recordRequest(input, init);
                return createResponse();
            }
        })
    };
}

function requireRequest(requests: readonly RequestRecord[], index: number, message: string): RequestRecord {
    const request = requests[index];
    if (request === undefined) {
        assert.fail(message);
    }
    return request;
}

function assertReleaseLookupRequest(request: RequestRecord): void {
    assert.partialDeepStrictEqual(request, {
        method: 'GET',
        url: 'https://api.github.com/repos/owner/repo/releases/tags/pkg-a%401.0.0',
        headers: {
            authorization: 'Bearer token',
            accept: 'application/vnd.github+json',
            userAgent: 'packtory',
            githubApiVersion: '2022-11-28'
        },
        body: undefined
    });
}

suite('github-release-client', function () {
    test('createReleaseIfMissing returns existing without rewriting release notes', async function () {
        const { client, requests } = createClientWithStatuses([ 200 ]);

        const result = await client.createReleaseIfMissing({
            tagName: 'pkg-a@1.0.0',
            name: 'pkg-a@1.0.0',
            body: 'notes'
        });

        assert.strictEqual(result, 'existing');
        assert.strictEqual(requests.length, 1);
        assertReleaseLookupRequest(requireRequest(requests, 0, 'Expected a GitHub release lookup request'));
    });

    test('createReleaseIfMissing creates a release when the tag has no release', async function () {
        const { client, requests } = createClientWithStatuses([ 404, 201 ]);

        const result = await client.createReleaseIfMissing({
            tagName: 'pkg-a@1.0.0',
            name: 'pkg-a@1.0.0',
            body: 'notes'
        });

        assert.strictEqual(result, 'created');
        assert.strictEqual(requests.length, 2);
        const postRequest = requireRequest(requests, 1, 'Expected a GitHub release creation request');
        assert.partialDeepStrictEqual(postRequest, {
            method: 'POST',
            url: 'https://api.github.com/repos/owner/repo/releases'
        });
        assert.deepStrictEqual(JSON.parse(postRequest.body ?? '{}'), {
            tag_name: 'pkg-a@1.0.0',
            name: 'pkg-a@1.0.0',
            body: 'notes'
        });
    });

    test('createReleaseIfMissing rejects GitHub API failures', async function () {
        const { client } = createClientWithStatuses([ 500 ]);

        await assert.rejects(
            client.createReleaseIfMissing({
                tagName: 'pkg-a@1.0.0',
                name: 'pkg-a@1.0.0',
                body: 'notes'
            }),
            function (error: unknown) {
                assert.ok(error instanceof Error);
                assert.ok(error.cause instanceof Error);
                assert.match(
                    error.message,
                    /GitHub API request failed \(500\) for \/repos\/owner\/repo\/releases\/tags\/pkg-a%401\.0\.0/u
                );
                return true;
            }
        );
    });

    test('createReleaseIfMissing rejects a failed create response', async function () {
        const { client } = createClientWithStatuses([ 404, 404 ]);

        await assert.rejects(
            client.createReleaseIfMissing({
                tagName: 'pkg-a@1.0.0',
                name: 'pkg-a@1.0.0',
                body: 'notes'
            }),
            /could not be created/u
        );
    });
});
