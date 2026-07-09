import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    captureRequests,
    createClient,
    createCommit,
    createPullRequest,
    createRecordedRouteFetch,
    emptyResponse,
    hasRequestWithBody,
    jsonResponse,
    readHeader,
    requestHasSearchParameter,
    routeKey,
    type CapturedRequests,
    type RecordedRequest,
    type RouteResponse
} from '../../test-libraries/release-pr-github-client-test-support.ts';

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
    [ routeKey('DELETE', `/repos/owner/repo/git/refs/${encodeURIComponent('heads/release/packtory')}`), emptyResponse ],
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

function createFetch(capturedRequests: CapturedRequests): typeof globalThis.fetch {
    return createRecordedRouteFetch(capturedRequests, defaultRoutes);
}

function assertBranchWasDeleted(records: readonly RecordedRequest[]): void {
    assert.strictEqual(
        records.some(function (record) {
            return (
                record.method === 'DELETE' &&
                record.path === `/repos/owner/repo/git/refs/${encodeURIComponent('heads/release/packtory')}`
            );
        }),
        true
    );
}

function countReleasePullRequestLookups(records: readonly RecordedRequest[]): number {
    return records
        .filter(function (record) {
            return (
                record.method === 'GET' &&
                record.path === '/repos/owner/repo/pulls' &&
                requestHasSearchParameter(record, 'head', 'owner:release/packtory') &&
                requestHasSearchParameter(record, 'state', 'open')
            );
        })
        .length;
}

suite('release-pr-github-client', function () {
    test('maintains release pull requests', async function () {
        const capturedRequests = captureRequests();
        const client = createClient(createFetch(capturedRequests));

        await client.closeOpenReleasePullRequests({ baseBranch: 'main', releaseBranch: 'release/packtory' });
        await client.deleteBranch('release/packtory');
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
        assert.strictEqual(countReleasePullRequestLookups(capturedRequests.records), 2);
        assert.strictEqual(
            hasRequestWithBody(capturedRequests.records, 'PATCH', '/repos/owner/repo/pulls/1', '"state":"closed"'),
            true
        );
        assertBranchWasDeleted(capturedRequests.records);
        assert.strictEqual(
            hasRequestWithBody(capturedRequests.records, 'PUT', '/repos/owner/repo/issues/1/labels', '"release"'),
            true
        );
        assert.strictEqual(readHeader(capturedRequests.records[0]?.headers, 'user-agent'), 'packtory-release-pr');
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
            return (
                record.path === '/repos/owner/repo/actions/workflows/101/runs' &&
                requestHasSearchParameter(record, 'event', 'workflow_dispatch')
            );
        }));
    });

    test('finds dispatched workflow runs through the repository fallback when workflow runs lag', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(
            createRecordedRouteFetch(
                capturedRequests,
                new Map([
                    [ routeKey('GET', '/repos/owner/repo/actions/workflows'), function () {
                        return jsonResponse({
                            workflows: [ { id: 101, name: 'ci', path: '.github/workflows/ci.yml' } ]
                        });
                    } ],
                    [ routeKey('GET', '/repos/owner/repo/actions/workflows/101/runs'), function () {
                        return jsonResponse({
                            workflow_runs: [
                                { database_id: 21, event: 'workflow_dispatch', head_sha: 'other-head' }
                            ]
                        });
                    } ],
                    [ routeKey('GET', '/repos/owner/repo/actions/runs'), function () {
                        return jsonResponse({
                            workflow_runs: [
                                { database_id: 22, event: 'workflow_dispatch', head_sha: 'release-head' }
                            ]
                        });
                    } ]
                ])
            )
        );

        assert.deepStrictEqual(
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headSha: 'release-head',
                workflowFile: 'ci.yml'
            }),
            { event: 'workflow_dispatch', observedRunIds: [ 21, 22 ], runId: 22 }
        );
        assert.ok(records.some(function (record) {
            return (
                record.path === '/repos/owner/repo/actions/runs' &&
                requestHasSearchParameter(record, 'event', 'workflow_dispatch')
            );
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
        assert.partialDeepStrictEqual(pullRequest, {
            number: 12,
            merged: true
        });
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
        assert.ok(records.some(function (record) {
            return (
                record.path === '/repos/owner/repo/actions/runs' &&
                requestHasSearchParameter(record, 'event', 'pull_request')
            );
        }));
    });

    test('creates a release pull request when no open release pull request exists', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const fetchMock = createRecordedRouteFetch(
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
});
