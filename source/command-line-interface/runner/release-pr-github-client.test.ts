import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createReleasePullRequestGitHubClient,
    type ReleasePullRequestGitHubClient
} from './release-pr-github-client.ts';

type RecordedRequest = {
    readonly body: string;
    readonly headers: RequestHeaders | undefined;
    readonly method: string;
    readonly path: string;
    readonly search: string;
};
type RequestHeaders = Headers | Readonly<Record<string, string>> | readonly (readonly [string, string])[];
type RecordedRequestResult = {
    readonly method: string;
    readonly request: RecordedRequest;
    readonly url: URL;
};
type RouteResponse = () => Response;
type CapturedRequests = {
    readonly record: (request: RecordedRequest) => void;
    readonly records: readonly RecordedRequest[];
};

function jsonResponse(data: unknown, status = 200): Response {
    return Response.json(data, { status });
}

function emptyResponse(status = 204): Response {
    return new Response(null, { status });
}

function createPullRequest(
    number: number,
    overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
    return {
        base: { ref: 'main' },
        head: { ref: 'release/packtory', repo: { full_name: 'owner/repo' }, sha: 'release-head' },
        labels: [ { name: 'release' } ],
        merge_commit_sha: 'merge-sha',
        merged_at: '2026-06-01T00:00:00.000Z',
        number,
        title: 'Prepare release',
        user: { login: 'github-actions[bot]' },
        ...overrides
    };
}

function createCommit(message = 'Release packages'): Record<string, unknown> {
    return {
        commit: { message },
        parents: [ { sha: 'main-head' } ]
    };
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): URL {
    if (typeof input === 'string') {
        return new URL(input);
    }
    if (input instanceof URL) {
        return input;
    }
    return new URL(input.url);
}

function requestBody(init: Readonly<RequestInit> | undefined): string {
    return typeof init?.body === 'string' ? init.body : '';
}

function readHeader(headers: RequestHeaders | undefined, name: string): string | undefined {
    if (headers instanceof Headers) {
        return headers.get(name) ?? undefined;
    }
    if (headers === undefined || Array.isArray(headers)) {
        return undefined;
    }
    const value: unknown = Reflect.get(headers, name);
    return typeof value === 'string' ? value : undefined;
}

function captureRequests(): CapturedRequests {
    const records: RecordedRequest[] = [];
    return {
        record(request) {
            records.push(request);
        },
        records
    };
}

function recordRequest(
    input: Parameters<typeof globalThis.fetch>[0],
    init: Readonly<RequestInit> | undefined
): RecordedRequestResult {
    const url = requestUrl(input);
    const method = init?.method ?? 'GET';
    return {
        method,
        request: { body: requestBody(init), headers: init?.headers, method, path: url.pathname, search: url.search },
        url
    };
}

function requestHasSearchParameter(record: RecordedRequest, name: string, value: string): boolean {
    const searchParameters = new URLSearchParams(record.search);
    return searchParameters.get(name) === value;
}

function createClient(fetchImplementation: typeof globalThis.fetch): ReleasePullRequestGitHubClient {
    return createReleasePullRequestGitHubClient({
        fetch: fetchImplementation,
        owner: 'owner',
        repo: 'repo',
        token: 'token'
    });
}

function hasRequestWithBody(
    records: readonly RecordedRequest[],
    method: string,
    path: string,
    bodyPart: string
): boolean {
    return records.some(function (record) {
        return record.method === method && record.path === path && record.body.includes(bodyPart);
    });
}

function routeKey(method: string, path: string): string {
    return `${method} ${path}`;
}

const defaultRoutes: ReadonlyMap<string, RouteResponse> = new Map([
    [ routeKey('GET', '/repos/owner/repo/pulls'), function () {
        return jsonResponse([ createPullRequest(1) ]);
    } ],
    [ routeKey('POST', '/repos/owner/repo/pulls'), function () {
        return jsonResponse(createPullRequest(2));
    } ],
    [ routeKey('PATCH', '/repos/owner/repo/pulls/1'), function () {
        return jsonResponse(createPullRequest(1));
    } ],
    [ routeKey('GET', '/repos/owner/repo/pulls/12'), function () {
        return jsonResponse(createPullRequest(12));
    } ],
    [ routeKey('GET', '/repos/owner/repo/pulls/12/files'), function () {
        return jsonResponse([ { filename: 'CHANGELOG.md' } ]);
    } ],
    [ routeKey('GET', '/repos/owner/repo/pulls/1/files'), function () {
        return jsonResponse([ { filename: 'CHANGELOG.md' } ]);
    } ],
    [ routeKey('GET', '/repos/owner/repo/commits/release-head'), function () {
        return jsonResponse(createCommit());
    } ],
    [ routeKey('GET', '/repos/owner/repo/commits/merge-sha/pulls'), function () {
        return jsonResponse([ createPullRequest(12) ]);
    } ],
    [ routeKey('PUT', '/repos/owner/repo/issues/1/labels'), function () {
        return jsonResponse([ { name: 'release' } ]);
    } ],
    [ routeKey('POST', '/repos/owner/repo/statuses/release-head'), function () {
        return jsonResponse({});
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/runs'), function () {
        return jsonResponse({
            workflow_runs: [
                { conclusion: 'action_required', database_id: 10, event: 'pull_request', head_sha: 'release-head' },
                { conclusion: 'action_required', event: 'pull_request', head_sha: 'release-head' },
                { conclusion: 'action_required', database_id: 12, event: 'pull_request', head_sha: 'other-head' },
                { conclusion: 'success', database_id: 13, event: 'pull_request', head_sha: 'release-head' },
                { conclusion: 'success', database_id: 11, event: 'workflow_dispatch', head_sha: 'release-head' }
            ]
        });
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/workflows'), function () {
        return jsonResponse({
            workflows: [
                { id: 101, name: 'ci', path: '.github/workflows/ci.yml' },
                { id: 102, name: 'ci-db', path: '.github/workflows/ci-db.yml' }
            ]
        });
    } ],
    [ routeKey('DELETE', '/repos/owner/repo/actions/runs/10'), emptyResponse ],
    [ routeKey('GET', '/repos/owner/repo/actions/runs/11'), function () {
        return jsonResponse({ conclusion: 'success' });
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/runs/12'), function () {
        return jsonResponse({ conclusion: null });
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/runs/11/jobs'), function () {
        return jsonResponse({
            jobs: [ { conclusion: 'success', html_url: 'https://run/job', name: 'Node.js' } ],
            total_count: 1
        });
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/runs/12/jobs'), function () {
        return jsonResponse({
            jobs: [ { conclusion: null, html_url: null, name: 'Node.js' } ],
            total_count: 1
        });
    } ],
    [ routeKey('POST', '/repos/owner/repo/actions/workflows/101/dispatches'), emptyResponse ],
    [ routeKey('GET', '/repos/owner/repo/actions/workflows/101/runs'), function () {
        return jsonResponse({
            workflow_runs: [ { database_id: 11, event: 'workflow_dispatch', head_sha: 'release-head' } ]
        });
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/workflows/102/runs'), function () {
        return jsonResponse({
            workflow_runs: [ { databaseId: 12, event: 'workflow_dispatch', head_sha: 'release-head' } ]
        });
    } ],
    [ routeKey('GET', '/repos/owner/repo/branches/main'), function () {
        return jsonResponse({ commit: { sha: 'main-head' } });
    } ]
]);

function createFetchFromRoutes(
    capturedRequests: CapturedRequests,
    routes: ReadonlyMap<string, RouteResponse>
): typeof globalThis.fetch {
    return async function (input, init) {
        const { method, request, url } = recordRequest(input, init);
        capturedRequests.record(request);
        return routes.get(routeKey(method, url.pathname))?.() ??
            jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
    };
}

function createFetch(capturedRequests: CapturedRequests): typeof globalThis.fetch {
    return createFetchFromRoutes(capturedRequests, defaultRoutes);
}

suite('release-pr-github-client', function () {
    test('maintains release pull requests', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(createFetch(capturedRequests));

        await client.closeOpenReleasePullRequests({ baseBranch: 'main', releaseBranch: 'release/packtory' });
        assert.deepStrictEqual(
            await client.createOrUpdateReleasePullRequest({
                baseBranch: 'main',
                body: 'Body',
                label: 'release',
                releaseBranch: 'release/packtory',
                title: 'Prepare release'
            }),
            1
        );
        assert.strictEqual(
            records
                .filter(function (record) {
                    return (
                        record.method === 'GET' &&
                        record.path === '/repos/owner/repo/pulls' &&
                        requestHasSearchParameter(record, 'head', 'owner:release/packtory') &&
                        requestHasSearchParameter(record, 'state', 'open')
                    );
                })
                .length,
            2
        );
        assert.strictEqual(hasRequestWithBody(records, 'PATCH', '/repos/owner/repo/pulls/1', '"state":"closed"'), true);
        assert.strictEqual(hasRequestWithBody(records, 'PUT', '/repos/owner/repo/issues/1/labels', '"release"'), true);
        assert.strictEqual(readHeader(records[0]?.headers, 'user-agent'), 'packtory-release-pr');
    });

    test('writes statuses and dispatches workflows', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(createFetch(capturedRequests));

        await client.createStatus({
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'pending',
            state: 'pending',
            targetUrl: undefined
        });
        await client.createStatus({
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'success',
            state: 'success',
            targetUrl: 'https://run/job'
        });
        await client.dispatchWorkflow({ ref: 'release/packtory', workflowFile: 'ci.yml' });

        assert.strictEqual(
            hasRequestWithBody(records, 'POST', '/repos/owner/repo/statuses/release-head', '"target_url":null'),
            true
        );
        assert.strictEqual(
            hasRequestWithBody(
                records,
                'POST',
                '/repos/owner/repo/statuses/release-head',
                '"target_url":"https://run/job"'
            ),
            true
        );
        assert.strictEqual(
            hasRequestWithBody(
                records,
                'POST',
                '/repos/owner/repo/actions/workflows/101/dispatches',
                '"ref":"release/packtory"'
            ),
            true
        );
    });

    test('finds dispatched workflow runs and branch heads', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(createFetch(capturedRequests));

        assert.deepStrictEqual(
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headSha: 'release-head',
                workflowFile: 'ci.yml'
            }),
            { event: 'workflow_dispatch', observedRunIds: [ 11 ], runId: 11 }
        );
        const missingRunLookup = await client.findDispatchedWorkflowRun({
            branch: 'release/packtory',
            headSha: 'missing-head',
            workflowFile: 'ci.yml'
        });
        assert.strictEqual(missingRunLookup.runId, undefined);
        assert.deepStrictEqual(
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headSha: 'release-head',
                workflowFile: 'ci-db.yml'
            }),
            { event: 'workflow_dispatch', observedRunIds: [ 12 ], runId: 12 }
        );
        assert.strictEqual(await client.getBranchHeadSha('main'), 'main-head');
        assert.ok(records.some(function (record) {
            return record.search.includes('event=workflow_dispatch');
        }));
    });

    test('reads release pull request metadata', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(createFetch(capturedRequests));

        assert.deepStrictEqual(await client.getPullRequestHead(12), {
            author: 'github-actions[bot]',
            changedFiles: [ 'CHANGELOG.md' ],
            headRef: 'release/packtory',
            labels: [ 'release' ],
            parentShas: [ 'main-head' ],
            subject: 'Release packages',
            title: 'Prepare release'
        });
        const pullRequest = await client.getPullRequest(12);
        const commitPullRequests = await client.listCommitPullRequests('merge-sha');
        assert.strictEqual(pullRequest.number, 12);
        assert.strictEqual(pullRequest.merged, true);
        assert.strictEqual(commitPullRequests[0]?.number, 12);
        assert.strictEqual(records.length > 0, true);
    });

    test('reads workflow run results and deletes blocked runs', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(createFetch(capturedRequests));

        await client.deleteActionRequiredPullRequestRuns({ branch: 'release/packtory', headSha: 'release-head' });
        assert.deepStrictEqual(await client.readWorkflowRunResult(11), {
            conclusion: 'success',
            databaseId: 11,
            jobs: [ { conclusion: 'success', name: 'Node.js', url: 'https://run/job' } ],
            url: undefined
        });
        assert.deepStrictEqual(await client.readWorkflowRunResult(12), {
            conclusion: undefined,
            databaseId: 12,
            jobs: [ { conclusion: undefined, name: 'Node.js', url: undefined } ],
            url: undefined
        });
        assert.deepStrictEqual(
            records
                .filter(function (record) {
                    return record.method === 'DELETE';
                })
                .map(function (record) {
                    return record.path;
                }),
            [ '/repos/owner/repo/actions/runs/10' ]
        );
        assert.strictEqual(
            records.some(function (record) {
                const searchParameters = new URLSearchParams(record.search);
                return record.path === '/repos/owner/repo/actions/runs' &&
                    searchParameters.get('event') === 'pull_request';
            }),
            true
        );
    });

    test('creates a release pull request when no open release pull request exists', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const fetchMock = createFetchFromRoutes(
            capturedRequests,
            new Map([
                [ routeKey('GET', '/repos/owner/repo/pulls'), function () {
                    return jsonResponse([]);
                } ],
                [ routeKey('POST', '/repos/owner/repo/pulls'), function () {
                    return jsonResponse(createPullRequest(2));
                } ],
                [ routeKey('PUT', '/repos/owner/repo/issues/2/labels'), function () {
                    return jsonResponse([ { name: 'release' } ]);
                } ]
            ])
        );
        const client = createClient(fetchMock);

        assert.strictEqual(
            await client.createOrUpdateReleasePullRequest({
                baseBranch: 'main',
                body: 'Body',
                label: 'release',
                releaseBranch: 'release/packtory',
                title: 'Prepare release'
            }),
            2
        );
        assert.strictEqual(
            records.some(function (record) {
                return record.method === 'POST' && record.path === '/repos/owner/repo/pulls';
            }),
            true
        );
    });

    test('normalizes nullable GitHub response fields', async function () {
        const capturedRequests = captureRequests();
        const fetchMock = createFetchFromRoutes(
            capturedRequests,
            new Map([
                [ routeKey('GET', '/repos/owner/repo/pulls/12'), function () {
                    return jsonResponse(
                        createPullRequest(12, {
                            head: { ref: 'release/packtory', repo: null, sha: 'release-head' },
                            labels: [ { name: null }, {} ],
                            merge_commit_sha: null,
                            merged_at: null,
                            user: null
                        })
                    );
                } ],
                [ routeKey('GET', '/repos/owner/repo/pulls/13'), function () {
                    return jsonResponse(
                        createPullRequest(13, {
                            merge_commit_sha: null,
                            merged_at: undefined
                        })
                    );
                } ],
                [ routeKey('GET', '/repos/owner/repo/pulls/12/files'), function () {
                    return jsonResponse([]);
                } ],
                [ routeKey('GET', '/repos/owner/repo/pulls/13/files'), function () {
                    return jsonResponse([]);
                } ],
                [ routeKey('GET', '/repos/owner/repo/commits/release-head'), function () {
                    return jsonResponse(createCommit('Release packages\n\nDetails'));
                } ]
            ])
        );
        const client = createClient(fetchMock);

        assert.deepStrictEqual(await client.getPullRequest(12), {
            author: '',
            baseRef: 'main',
            changedFiles: [],
            headRef: 'release/packtory',
            headRepository: '',
            labels: [],
            mergeCommitSha: undefined,
            merged: false,
            number: 12,
            subject: 'Release packages',
            title: 'Prepare release'
        });
        const pullRequestWithOmittedMergeTimestamp = await client.getPullRequest(13);
        assert.strictEqual(pullRequestWithOmittedMergeTimestamp.merged, false);
    });

    test('formats failed GitHub API requests with the endpoint path', async function () {
        const client = createClient(async function () {
            return jsonResponse({ message: 'Bad credentials' }, 401);
        });

        await assert.rejects(
            async function () {
                await client.getBranchHeadSha('main');
            },
            function (error: unknown) {
                assert.ok(error instanceof Error);
                assert.strictEqual(
                    error.message,
                    'GitHub API request failed (401) for /repos/owner/repo/branches/main'
                );
                assert.ok(error.cause instanceof Error);
                return true;
            }
        );
    });
});
