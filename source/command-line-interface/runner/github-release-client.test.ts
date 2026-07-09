import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createGitHubReleaseClient, type GitHubReleaseClient } from './github-release-client.ts';

type RequestRecord = {
    readonly body: string | undefined;
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly method: string;
    readonly url: string;
};
type RouteHandler = (record: RequestRecord) => Response;
type RequestHeaders = Headers | Readonly<Record<string, string>> | readonly (readonly [string, string])[];

function routeKey(method: string, path: string): string {
    return `${method} ${path}`;
}

function jsonResponse(value: unknown, status = 200): Response {
    return Response.json(value, { status });
}

function emptyResponse(unusedRecord: RequestRecord): Response {
    return jsonResponse({ method: unusedRecord.method }, 201);
}

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
    return { ...headers };
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

function createClientWithRoutes(routes: ReadonlyMap<string, RouteHandler>): GitHubReleaseClientFixture {
    const requests: RequestRecord[] = [];
    function recordRequest(input: RequestInfo | URL, init: Readonly<RequestInit> | undefined): RequestRecord {
        return {
            url: readRequestUrl(input),
            method: init?.method ?? 'GET',
            body: typeof init?.body === 'string' ? init.body : undefined,
            headers: readRequestHeaders(init?.headers)
        };
    }
    function routeFor(record: RequestRecord): RouteHandler | undefined {
        const url = new URL(record.url);
        const path = decodeURIComponent(url.pathname);
        return routes.get(routeKey(record.method, path));
    }
    return {
        requests,
        client: createGitHubReleaseClient({
            owner: 'owner',
            repo: 'repo',
            token: 'token',
            async fetch(input, init) {
                const record = recordRequest(input, init);
                requests.push(record);
                const route = routeFor(record);
                return route === undefined ? jsonResponse({ message: 'missing' }, 404) : route(record);
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

const packageTagRequest = {
    tagName: 'pkg-a@1.0.0',
    message: 'pkg-a@1.0.0',
    targetHead: 'commit-sha'
};
const packageTagRefRoute = routeKey('GET', '/repos/owner/repo/git/ref/tags/pkg-a@1.0.0');

suite('github-release-client', function () {
    test('createReleaseIfMissing returns existing without rewriting release notes', async function () {
        const { client, requests } = createClientWithRoutes(
            new Map([
                [ routeKey('GET', '/repos/owner/repo/releases/tags/pkg-a@1.0.0'), emptyResponse ]
            ])
        );

        assert.strictEqual(
            await client.createReleaseIfMissing({ tagName: 'pkg-a@1.0.0', name: 'pkg-a@1.0.0', body: 'notes' }),
            'existing'
        );
        assert.strictEqual(requests.length, 1);
        assert.partialDeepStrictEqual(requireRequest(requests, 0, 'Expected release lookup request'), {
            method: 'GET',
            headers: {
                authorization: 'Bearer token',
                accept: 'application/vnd.github+json',
                userAgent: 'packtory',
                githubApiVersion: '2022-11-28'
            }
        });
    });

    test('createReleaseIfMissing creates a missing release', async function () {
        const { client, requests } = createClientWithRoutes(
            new Map([
                [ routeKey('POST', '/repos/owner/repo/releases'), emptyResponse ]
            ])
        );

        assert.strictEqual(
            await client.createReleaseIfMissing({ tagName: 'pkg-a@1.0.0', name: 'pkg-a@1.0.0', body: 'notes' }),
            'created'
        );
        assert.strictEqual(requests.length, 2);
        assert.deepStrictEqual(JSON.parse(requireRequest(requests, 1, 'Expected release creation body').body ?? '{}'), {
            tag_name: 'pkg-a@1.0.0',
            name: 'pkg-a@1.0.0',
            body: 'notes'
        });
    });

    test('createReleaseIfMissing rejects when the missing release cannot be created', async function () {
        const { client } = createClientWithRoutes(new Map());

        await assert.rejects(
            client.createReleaseIfMissing({ tagName: 'pkg-a@1.0.0', name: 'pkg-a@1.0.0', body: 'notes' }),
            /GitHub release for tag "pkg-a@1.0.0" could not be created/u
        );
    });

    test('ensureAnnotatedTag creates an annotated GitHub tag and ref', async function () {
        const { client, requests } = createClientWithRoutes(
            new Map([
                [ routeKey('POST', '/repos/owner/repo/git/tags'), function () {
                    return jsonResponse({ sha: 'tag-object-sha' }, 201);
                } ],
                [ routeKey('POST', '/repos/owner/repo/git/refs'), emptyResponse ]
            ])
        );

        assert.strictEqual(
            await client.ensureAnnotatedTag(packageTagRequest),
            'created'
        );
        assert.deepStrictEqual(JSON.parse(requireRequest(requests, 1, 'Expected tag creation body').body ?? '{}'), {
            tag: 'pkg-a@1.0.0',
            message: 'pkg-a@1.0.0',
            object: 'commit-sha',
            type: 'commit'
        });
        assert.deepStrictEqual(JSON.parse(requireRequest(requests, 2, 'Expected tag ref creation body').body ?? '{}'), {
            ref: 'refs/tags/pkg-a@1.0.0',
            sha: 'tag-object-sha'
        });
    });

    test('ensureAnnotatedTag rejects tag creation responses without a tag sha', async function () {
        const { client } = createClientWithRoutes(
            new Map([
                [ routeKey('POST', '/repos/owner/repo/git/tags'), function () {
                    return jsonResponse({ sha: '' }, 201);
                } ]
            ])
        );

        await assert.rejects(
            client.ensureAnnotatedTag(packageTagRequest),
            /GitHub tag object response did not include a sha/u
        );
    });

    test('ensureAnnotatedTag rejects tag creation responses with a non-string tag sha', async function () {
        const { client } = createClientWithRoutes(
            new Map([
                [ routeKey('POST', '/repos/owner/repo/git/tags'), function () {
                    return jsonResponse({ sha: { length: 1 } }, 201);
                } ]
            ])
        );

        await assert.rejects(
            client.ensureAnnotatedTag(packageTagRequest),
            /GitHub tag object response did not include a sha/u
        );
    });

    test('ensureAnnotatedTag accepts existing annotated tags that point at the target commit', async function () {
        const { client } = createClientWithRoutes(
            new Map([
                [ packageTagRefRoute, function () {
                    return jsonResponse({ object: { sha: 'tag-object-sha', type: 'tag' } });
                } ],
                [ routeKey('GET', '/repos/owner/repo/git/tags/tag-object-sha'), function () {
                    return jsonResponse({ object: { sha: 'commit-sha', type: 'commit' } });
                } ]
            ])
        );

        assert.strictEqual(
            await client.ensureAnnotatedTag(packageTagRequest),
            'existing'
        );
    });

    test('ensureAnnotatedTag accepts existing lightweight tags that point at the target commit', async function () {
        const { client } = createClientWithRoutes(
            new Map([
                [ packageTagRefRoute, function () {
                    return jsonResponse({ object: { sha: 'commit-sha', type: 'commit' } });
                } ]
            ])
        );

        assert.strictEqual(
            await client.ensureAnnotatedTag(packageTagRequest),
            'existing'
        );
    });

    test('ensureAnnotatedTag rejects existing tags that point at another commit', async function () {
        const { client } = createClientWithRoutes(
            new Map([
                [ packageTagRefRoute, function () {
                    return jsonResponse({ object: { sha: 'other-sha', type: 'commit' } });
                } ]
            ])
        );

        await assert.rejects(
            client.ensureAnnotatedTag(packageTagRequest),
            /already exists at other-sha/u
        );
    });
});
