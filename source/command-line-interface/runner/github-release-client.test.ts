import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createGitHubReleaseClient } from './github-release-client.ts';

type RequestRecord = {
    readonly body: string | undefined;
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly method: string;
    readonly url: string;
};

function readRequestUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') {
        return input;
    }
    if (input instanceof URL) {
        return input.toString();
    }
    return input.url;
}

function readRequestHeaders(headers: HeadersInit | undefined): Readonly<Record<string, string | undefined>> {
    const parsedHeaders = new Headers(headers);
    return {
        accept: parsedHeaders.get('accept') ?? undefined,
        authorization: parsedHeaders.get('authorization') ?? undefined,
        contentType: parsedHeaders.get('content-type') ?? undefined,
        userAgent: parsedHeaders.get('user-agent') ?? undefined,
        githubApiVersion: parsedHeaders.get('x-github-api-version') ?? undefined
    };
}

function createClientWithStatuses(statuses: readonly number[]): {
    readonly client: ReturnType<typeof createGitHubReleaseClient>;
    readonly requests: readonly RequestRecord[];
} {
    const requests: RequestRecord[] = [];
    let requestCount = 0;
    return {
        requests,
        client: createGitHubReleaseClient({
            owner: 'owner',
            repo: 'repo',
            token: 'token',
            async fetch(input, init) {
                requests.push({
                    url: readRequestUrl(input),
                    method: init?.method ?? 'GET',
                    body: typeof init?.body === 'string' ? init.body : undefined,
                    headers: readRequestHeaders(init?.headers)
                });
                const status = statuses[requestCount] ?? 500;
                requestCount += 1;
                return new Response('{}', { status });
            }
        })
    };
}

suite('github-release-client', function () {
    test('createReleaseIfMissing returns existing without rewriting release notes', async function () {
        const { client, requests } = createClientWithStatuses([200]);

        const result = await client.createReleaseIfMissing({
            tagName: 'pkg-a@1.0.0',
            name: 'pkg-a@1.0.0',
            body: 'notes'
        });

        assert.strictEqual(result, 'existing');
        assert.strictEqual(requests.length, 1);
        const firstRequest = requests[0];
        if (firstRequest === undefined) {
            assert.fail('Expected a GitHub release lookup request');
        }
        assert.strictEqual(firstRequest.method, 'GET');
        assert.strictEqual(firstRequest.url, 'https://api.github.com/repos/owner/repo/releases/tags/pkg-a%401.0.0');
        assert.strictEqual(firstRequest.headers.authorization, 'Bearer token');
        assert.strictEqual(firstRequest.headers.accept, 'application/vnd.github+json');
        assert.strictEqual(firstRequest.headers.userAgent, 'packtory');
        assert.strictEqual(firstRequest.headers.githubApiVersion, '2022-11-28');
        assert.strictEqual(firstRequest.body, undefined);
    });

    test('createReleaseIfMissing creates a release when the tag has no release', async function () {
        const { client, requests } = createClientWithStatuses([404, 201]);

        const result = await client.createReleaseIfMissing({
            tagName: 'pkg-a@1.0.0',
            name: 'pkg-a@1.0.0',
            body: 'notes'
        });

        assert.strictEqual(result, 'created');
        assert.strictEqual(requests.length, 2);
        const postRequest = requests[1];
        if (postRequest === undefined) {
            assert.fail('Expected a GitHub release creation request');
        }
        assert.strictEqual(postRequest.method, 'POST');
        assert.strictEqual(postRequest.url, 'https://api.github.com/repos/owner/repo/releases');
        assert.deepStrictEqual(JSON.parse(postRequest.body ?? '{}'), {
            tag_name: 'pkg-a@1.0.0',
            name: 'pkg-a@1.0.0',
            body: 'notes'
        });
    });

    test('createReleaseIfMissing rejects GitHub API failures', async function () {
        const { client } = createClientWithStatuses([500]);

        await assert.rejects(
            client.createReleaseIfMissing({
                tagName: 'pkg-a@1.0.0',
                name: 'pkg-a@1.0.0',
                body: 'notes'
            }),
            (error: unknown) => {
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
        const { client } = createClientWithStatuses([404, 404]);

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
