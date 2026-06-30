import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    emptyResponse,
    hasRequestWithBody,
    jsonResponse,
    readHeader,
    recordRequest,
    requestUrl,
    type RecordedRequest
} from '../../test-libraries/github-client-fetch-fixtures.ts';
import { createReleasePullRequestGitHubClient } from './release-pr-github-client.ts';

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
        if (url.pathname === '/repos/owner/repo/actions/runs' && url.searchParams.get('event') === 'pull_request') {
            return jsonResponse({
                workflow_runs: [
                    { conclusion: 'action_required', event: 'pull_request', head_sha: 'release-head', id: 10 },
                    { conclusion: 'action_required', event: 'pull_request', head_sha: 'release-head' },
                    { conclusion: 'action_required', event: 'pull_request', head_sha: 'other-head', id: 12 },
                    { conclusion: 'success', event: 'pull_request', head_sha: 'release-head', id: 13 }
                ]
            });
        }
        if (
            url.pathname === '/repos/owner/repo/actions/runs' &&
            url.searchParams.get('event') === 'workflow_dispatch'
        ) {
            return jsonResponse({
                workflow_runs: [{ conclusion: 'success', event: 'workflow_dispatch', head_sha: 'release-head', id: 11 }]
            });
        }
        if (url.pathname === '/repos/owner/repo/actions/runs/10' && method === 'DELETE') {
            return emptyResponse();
        }
        if (url.pathname === '/repos/owner/repo/actions/runs/11') {
            return jsonResponse({ conclusion: 'success', html_url: 'https://run/11' });
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
        if (url.pathname === '/repos/owner/repo/actions/workflows') {
            return jsonResponse({
                total_count: 2,
                workflows: [
                    { id: 101, name: 'Continuous Integration', path: '.github/workflows/ci.yml' },
                    { id: 102, name: 'Database CI', path: '.github/workflows/ci-db.yml' }
                ]
            });
        }
        if (url.pathname === '/repos/owner/repo/actions/workflows/101/dispatches') {
            return emptyResponse();
        }
        if (url.pathname === '/repos/owner/repo/actions/workflows/101/runs') {
            return jsonResponse({
                workflow_runs: []
            });
        }
        if (url.pathname === '/repos/owner/repo/actions/workflows/102/runs') {
            return jsonResponse({
                workflow_runs: [
                    {
                        databaseId: 12,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        name: 'Database CI',
                        path: 'enormora/packtory/.github/workflows/ci-db.yml',
                        workflow_id: 102
                    }
                ]
            });
        }
        if (url.pathname === '/repos/owner/repo/branches/main') {
            return jsonResponse({ commit: { sha: 'main-head' } });
        }

        return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
    };
}

function createWorkflowListFetch(workflows: readonly Record<string, unknown>[]): typeof globalThis.fetch {
    return async (input) => {
        const url = requestUrl(input);

        if (url.pathname === '/repos/owner/repo/actions/workflows') {
            return jsonResponse({ total_count: workflows.length, workflows });
        }

        return jsonResponse({ message: `Unhandled ${url.pathname}` }, 500);
    };
}

async function assertDispatchedWorkflowLookupFails(
    workflows: readonly Record<string, unknown>[],
    workflowFile: string,
    message: string
): Promise<void> {
    const client = createClient(createWorkflowListFetch(workflows));

    await assert.rejects(
        async () => {
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headSha: 'release-head',
                workflowFile
            });
        },
        { message }
    );
}

suite('release-pr-github-client', function () {
    test('maintains release pull requests and reads release metadata', async function () {
        const records: RecordedRequest[] = [];
        const client = createClient(createFetch(records));

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

        assert.deepStrictEqual(
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headSha: 'release-head',
                workflowFile: 'ci.yml'
            }),
            { event: 'workflow_dispatch', observedRunIds: [11], runId: 11 }
        );
        const missingRun = await client.findDispatchedWorkflowRun({
            branch: 'release/packtory',
            headSha: 'missing-head',
            workflowFile: 'ci.yml'
        });
        assert.strictEqual(missingRun.runId, undefined);
        assert.deepStrictEqual(
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headSha: 'release-head',
                workflowFile: 'ci-db.yml'
            }),
            { event: 'workflow_dispatch', observedRunIds: [12], runId: 12 }
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
            jobs: [{ conclusion: 'success', name: 'Node.js', url: 'https://run/job' }],
            url: 'https://run/11'
        });
        assert.deepStrictEqual(await client.readWorkflowRunResult(12), {
            conclusion: undefined,
            databaseId: 12,
            jobs: [{ conclusion: undefined, name: 'Node.js', url: undefined }],
            url: undefined
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
                '/repos/owner/repo/actions/workflows/101/dispatches',
                '"ref":"release/packtory"'
            ),
            true
        );
        assert.ok(records.some((record) => record.search.includes('event=pull_request')));
        assert.ok(records.some((record) => record.search.includes('event=workflow_dispatch')));
        assert.ok(
            records.some((record) => {
                return (
                    record.method === 'GET' &&
                    record.path === '/repos/owner/repo/actions/runs' &&
                    requestHasSearchParameter(record, 'event', 'workflow_dispatch')
                );
            })
        );
        assert.strictEqual(readHeader(records[0]?.headers, 'user-agent'), 'packtory-release-pr');
        assert.strictEqual(readHeader(records[0]?.headers, 'accept'), 'application/vnd.github+json');
        assert.strictEqual(readHeader(records[0]?.headers, 'x-github-api-version'), '2022-11-28');
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

    test('resolves dispatched workflows by id, name, and path', async function () {
        const records: RecordedRequest[] = [];
        const fetchMock: typeof globalThis.fetch = async (input, init) => {
            const { method, url } = recordRequest(records, input, init);

            if (url.pathname === '/repos/owner/repo/actions/workflows') {
                return jsonResponse({
                    total_count: 3,
                    workflows: [
                        { id: 101, name: 'Continuous Integration', path: '.github/workflows/ci.yml' },
                        { id: 102, name: 'Database CI', path: '.github/workflows/ci-db.yml' },
                        { id: 103, name: 'Release CI', path: '.github/workflows/release.yml' }
                    ]
                });
            }
            if (url.pathname.endsWith('/dispatches') && method === 'POST') {
                return emptyResponse();
            }

            return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
        };
        const client = createClient(fetchMock);

        await client.dispatchWorkflow({ ref: 'release/packtory', workflowFile: '101' });
        await client.dispatchWorkflow({ ref: 'release/packtory', workflowFile: 'Database CI' });
        await client.dispatchWorkflow({ ref: 'release/packtory', workflowFile: '.github/workflows/release.yml' });

        assert.deepStrictEqual(
            records.filter((record) => record.method === 'POST').map((record) => record.path),
            [
                '/repos/owner/repo/actions/workflows/101/dispatches',
                '/repos/owner/repo/actions/workflows/102/dispatches',
                '/repos/owner/repo/actions/workflows/103/dispatches'
            ]
        );
    });

    test('matches dispatched workflow runs by workflow identity fields', async function () {
        const fetchMock: typeof globalThis.fetch = async (input) => {
            const url = requestUrl(input);

            if (url.pathname === '/repos/owner/repo/actions/workflows') {
                return jsonResponse({
                    total_count: 1,
                    workflows: [{ id: 101, name: 'Continuous Integration', path: '.github/workflows/ci.yml' }]
                });
            }
            if (url.pathname === '/repos/owner/repo/actions/workflows/101/runs') {
                assert.strictEqual(url.searchParams.get('event'), 'workflow_dispatch');
                return jsonResponse({
                    workflow_runs: [
                        {
                            event: 'workflow_dispatch',
                            head_sha: 'exact-head',
                            id: 20,
                            name: 'Continuous Integration',
                            path: '.github/workflows/ci.yml',
                            workflow_id: 101
                        },
                        {
                            event: 'workflow_dispatch',
                            head_sha: 'suffix-head',
                            id: 10,
                            name: 'Continuous Integration',
                            path: '.github/workflows/ci.yml',
                            workflow_id: 999
                        },
                        {
                            event: 'workflow_dispatch',
                            head_sha: 'suffix-head',
                            id: 11,
                            name: 'Continuous Integration',
                            path: '.github/workflows/other.yml',
                            workflow_id: 101
                        },
                        {
                            event: 'workflow_dispatch',
                            head_sha: 'suffix-head',
                            id: 12,
                            name: 'Other CI',
                            path: '.github/workflows/ci.yml',
                            workflow_id: 101
                        },
                        {
                            event: 'workflow_dispatch',
                            head_sha: 'suffix-head',
                            id: 13,
                            name: 'Continuous Integration',
                            path: 'owner/repo/.github/workflows/ci.yml',
                            workflow_id: 101
                        },
                        {
                            event: 'workflow_dispatch',
                            head_sha: 'null-head',
                            id: 14,
                            name: null,
                            path: null,
                            workflow_id: null
                        },
                        {
                            event: 'workflow_dispatch',
                            head_sha: 'omitted-head',
                            id: 15
                        }
                    ]
                });
            }

            return jsonResponse({ message: `Unhandled ${url.pathname}` }, 500);
        };
        const client = createClient(fetchMock);
        async function findRunId(headSha: string): Promise<number | undefined> {
            const result = await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headSha,
                workflowFile: 'ci.yml'
            });
            return result.runId;
        }

        assert.strictEqual(await findRunId('exact-head'), 20);
        assert.strictEqual(await findRunId('suffix-head'), 13);
        assert.strictEqual(await findRunId('null-head'), 14);
        assert.strictEqual(await findRunId('omitted-head'), 15);
    });

    test('fails when a dispatched workflow identifier matches no workflow', async function () {
        await assertDispatchedWorkflowLookupFails(
            [],
            'missing.yml',
            'GitHub Actions workflow "missing.yml" was not found'
        );
    });

    test('fails when a dispatched workflow identifier matches multiple workflows', async function () {
        await assertDispatchedWorkflowLookupFails(
            [
                { id: 101, name: 'CI', path: '.github/workflows/ci.yml' },
                { id: 102, name: 'CI copy', path: '.github/workflows/ci.yml' }
            ],
            'ci.yml',
            'GitHub Actions workflow "ci.yml" matched multiple workflows'
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
