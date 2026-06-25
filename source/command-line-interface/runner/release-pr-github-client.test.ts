import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createReleasePullRequestGitHubClient } from './release-pr-github-client.ts';

type RecordedRequest = {
    readonly body: string;
    readonly headers: HeadersInit | undefined;
    readonly method: string;
    readonly path: string;
    readonly search: string;
};

function jsonResponse(data: unknown, status = 200): Response {
    return Response.json(data, { status });
}

function emptyResponse(status = 204): Response {
    return new Response(null, { status });
}

function createPullRequest(number: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        base: { ref: 'main' },
        head: { ref: 'release/packtory', repo: { full_name: 'owner/repo' }, sha: 'release-head' },
        labels: [{ name: 'release' }],
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
        parents: [{ sha: 'main-head' }]
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

function requestBody(init: Parameters<typeof globalThis.fetch>[1]): string {
    return typeof init?.body === 'string' ? init.body : '';
}

function readHeader(headers: HeadersInit | undefined, name: string): string | undefined {
    if (headers instanceof Headers) {
        return headers.get(name) ?? undefined;
    }
    if (headers === undefined || Array.isArray(headers)) {
        return undefined;
    }
    const value: unknown = Reflect.get(headers, name);
    return typeof value === 'string' ? value : undefined;
}

function recordRequest(
    records: RecordedRequest[],
    input: Parameters<typeof globalThis.fetch>[0],
    init: Parameters<typeof globalThis.fetch>[1]
): { readonly method: string; readonly url: URL } {
    const url = requestUrl(input);
    const method = init?.method ?? 'GET';
    records.push({ body: requestBody(init), headers: init?.headers, method, path: url.pathname, search: url.search });
    return { method, url };
}

function requestHasSearchParameter(record: RecordedRequest, name: string, value: string): boolean {
    return new URLSearchParams(record.search).get(name) === value;
}

function createClient(fetchImplementation: typeof globalThis.fetch) {
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
    return records.some((record) => {
        return record.method === method && record.path === path && record.body.includes(bodyPart);
    });
}

function createFetch(records: RecordedRequest[]): typeof globalThis.fetch {
    return async (input, init) => {
        const { method, url } = recordRequest(records, input, init);

        if (url.pathname === '/repos/owner/repo/pulls' && method === 'GET') {
            return jsonResponse([createPullRequest(1)]);
        }
        if (url.pathname === '/repos/owner/repo/pulls' && method === 'POST') {
            return jsonResponse(createPullRequest(2));
        }
        if (url.pathname === '/repos/owner/repo/pulls/1' && method === 'PATCH') {
            return jsonResponse(createPullRequest(1));
        }
        if (url.pathname === '/repos/owner/repo/pulls/12') {
            return jsonResponse(createPullRequest(12));
        }
        if (url.pathname === '/repos/owner/repo/pulls/12/files') {
            return jsonResponse([{ filename: 'CHANGELOG.md' }]);
        }
        if (url.pathname === '/repos/owner/repo/pulls/1/files') {
            return jsonResponse([{ filename: 'CHANGELOG.md' }]);
        }
        if (url.pathname === '/repos/owner/repo/commits/release-head') {
            return jsonResponse(createCommit());
        }
        if (url.pathname === '/repos/owner/repo/commits/merge-sha/pulls') {
            return jsonResponse([createPullRequest(12)]);
        }
        if (url.pathname === '/repos/owner/repo/issues/1/labels' && method === 'PUT') {
            return jsonResponse([{ name: 'release' }]);
        }
        if (url.pathname === '/repos/owner/repo/statuses/release-head') {
            return jsonResponse({});
        }
        if (url.pathname === '/repos/owner/repo/actions/runs') {
            return jsonResponse({
                workflow_runs: [
                    { conclusion: 'action_required', database_id: 10, event: 'pull_request', head_sha: 'release-head' },
                    { conclusion: 'action_required', event: 'pull_request', head_sha: 'release-head' },
                    { conclusion: 'action_required', database_id: 12, event: 'pull_request', head_sha: 'other-head' },
                    { conclusion: 'success', database_id: 13, event: 'pull_request', head_sha: 'release-head' },
                    { conclusion: 'success', database_id: 11, event: 'workflow_dispatch', head_sha: 'release-head' }
                ]
            });
        }
        if (url.pathname === '/repos/owner/repo/actions/runs/10' && method === 'DELETE') {
            return emptyResponse();
        }
        if (url.pathname === '/repos/owner/repo/actions/runs/11') {
            return jsonResponse({ conclusion: 'success' });
        }
        if (url.pathname === '/repos/owner/repo/actions/runs/12') {
            return jsonResponse({ conclusion: null });
        }
        if (url.pathname === '/repos/owner/repo/actions/runs/11/jobs') {
            return jsonResponse({
                jobs: [{ conclusion: 'success', html_url: 'https://run/job', name: 'Node.js' }],
                total_count: 1
            });
        }
        if (url.pathname === '/repos/owner/repo/actions/runs/12/jobs') {
            return jsonResponse({
                jobs: [{ conclusion: null, html_url: null, name: 'Node.js' }],
                total_count: 1
            });
        }
        if (url.pathname === '/repos/owner/repo/actions/workflows/ci.yml/dispatches') {
            return emptyResponse();
        }
        if (url.pathname === '/repos/owner/repo/actions/workflows/ci.yml/runs') {
            return jsonResponse({
                workflow_runs: [{ database_id: 11, event: 'workflow_dispatch', head_sha: 'release-head' }]
            });
        }
        if (url.pathname === '/repos/owner/repo/actions/workflows/ci-db.yml/runs') {
            return jsonResponse({
                workflow_runs: [{ databaseId: 12, event: 'workflow_dispatch', head_sha: 'release-head' }]
            });
        }
        if (url.pathname === '/repos/owner/repo/branches/main') {
            return jsonResponse({ commit: { sha: 'main-head' } });
        }

        return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
    };
}

suite('release-pr-github-client', function () {
    test('maintains release pull requests and reads release metadata', async function () {
        const records: RecordedRequest[] = [];
        const client = createClient(createFetch(records));

        await client.closeOpenReleasePullRequests({ baseBranch: 'main', releaseBranch: 'release/packtory' });
        assert.strictEqual(
            await client.createOrUpdateReleasePullRequest({
                baseBranch: 'main',
                body: 'Body',
                label: 'release',
                releaseBranch: 'release/packtory',
                title: 'Prepare release'
            }),
            1
        );
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
        await client.deleteActionRequiredPullRequestRuns({ branch: 'release/packtory', headSha: 'release-head' });
        await client.dispatchWorkflow({ ref: 'release/packtory', workflowFile: 'ci.yml' });

        assert.strictEqual(
            await client.findDispatchedWorkflowRunId({
                branch: 'release/packtory',
                headSha: 'release-head',
                workflowFile: 'ci.yml'
            }),
            11
        );
        assert.strictEqual(
            await client.findDispatchedWorkflowRunId({
                branch: 'release/packtory',
                headSha: 'missing-head',
                workflowFile: 'ci.yml'
            }),
            undefined
        );
        assert.strictEqual(
            await client.findDispatchedWorkflowRunId({
                branch: 'release/packtory',
                headSha: 'release-head',
                workflowFile: 'ci-db.yml'
            }),
            12
        );
        assert.strictEqual(await client.getBranchHeadSha('main'), 'main-head');
        assert.deepStrictEqual(await client.getPullRequestHead(12), {
            author: 'github-actions[bot]',
            changedFiles: ['CHANGELOG.md'],
            headRef: 'release/packtory',
            labels: ['release'],
            parentShas: ['main-head'],
            subject: 'Release packages',
            title: 'Prepare release'
        });
        const pullRequest = await client.getPullRequest(12);
        const commitPullRequests = await client.listCommitPullRequests('merge-sha');
        assert.strictEqual(pullRequest.number, 12);
        assert.strictEqual(pullRequest.merged, true);
        assert.strictEqual(commitPullRequests[0]?.number, 12);
        assert.deepStrictEqual(await client.readWorkflowRunResult(11), {
            conclusion: 'success',
            databaseId: 11,
            jobs: [{ conclusion: 'success', name: 'Node.js', url: 'https://run/job' }]
        });
        assert.deepStrictEqual(await client.readWorkflowRunResult(12), {
            conclusion: undefined,
            databaseId: 12,
            jobs: [{ conclusion: undefined, name: 'Node.js', url: undefined }]
        });
        assert.deepStrictEqual(
            records.filter((record) => record.method === 'DELETE').map((record) => record.path),
            ['/repos/owner/repo/actions/runs/10']
        );
        assert.strictEqual(
            records.filter((record) => {
                return (
                    record.method === 'GET' &&
                    record.path === '/repos/owner/repo/pulls' &&
                    requestHasSearchParameter(record, 'head', 'owner:release/packtory') &&
                    requestHasSearchParameter(record, 'state', 'open')
                );
            }).length,
            2
        );
        assert.strictEqual(hasRequestWithBody(records, 'PATCH', '/repos/owner/repo/pulls/1', '"state":"closed"'), true);
        assert.strictEqual(hasRequestWithBody(records, 'PUT', '/repos/owner/repo/issues/1/labels', '"release"'), true);
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
                '/repos/owner/repo/actions/workflows/ci.yml/dispatches',
                '"ref":"release/packtory"'
            ),
            true
        );
        assert.ok(records.some((record) => record.search.includes('event=pull_request')));
        assert.ok(records.some((record) => record.search.includes('event=workflow_dispatch')));
        assert.strictEqual(readHeader(records[0]?.headers, 'user-agent'), 'packtory-release-pr');
    });

    test('creates a release pull request when no open release pull request exists', async function () {
        const records: RecordedRequest[] = [];
        const fetchMock: typeof globalThis.fetch = async (input, init) => {
            const { method, url } = recordRequest(records, input, init);

            if (url.pathname === '/repos/owner/repo/pulls' && method === 'GET') {
                return jsonResponse([]);
            }
            if (url.pathname === '/repos/owner/repo/pulls' && method === 'POST') {
                return jsonResponse(createPullRequest(2));
            }
            if (url.pathname === '/repos/owner/repo/issues/2/labels' && method === 'PUT') {
                return jsonResponse([{ name: 'release' }]);
            }

            return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
        };
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
            records.some((record) => record.method === 'POST' && record.path === '/repos/owner/repo/pulls'),
            true
        );
    });

    test('normalizes nullable GitHub response fields', async function () {
        const fetchMock: typeof globalThis.fetch = async (input) => {
            const url = requestUrl(input);

            if (url.pathname === '/repos/owner/repo/pulls/12') {
                return jsonResponse(
                    createPullRequest(12, {
                        head: { ref: 'release/packtory', repo: null, sha: 'release-head' },
                        labels: [{ name: null }, {}],
                        merge_commit_sha: null,
                        merged_at: null,
                        user: null
                    })
                );
            }
            if (url.pathname === '/repos/owner/repo/pulls/13') {
                return jsonResponse(
                    createPullRequest(13, {
                        merge_commit_sha: null,
                        merged_at: undefined
                    })
                );
            }
            if (url.pathname === '/repos/owner/repo/pulls/12/files') {
                return jsonResponse([]);
            }
            if (url.pathname === '/repos/owner/repo/pulls/13/files') {
                return jsonResponse([]);
            }
            if (url.pathname === '/repos/owner/repo/commits/release-head') {
                return jsonResponse(createCommit('Release packages\n\nDetails'));
            }

            return jsonResponse({ message: `Unhandled ${url.pathname}` }, 500);
        };
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
        const client = createClient(async () => {
            return jsonResponse({ message: 'Bad credentials' }, 401);
        });

        await assert.rejects(
            async () => {
                await client.getBranchHeadSha('main');
            },
            (error: unknown) => {
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
