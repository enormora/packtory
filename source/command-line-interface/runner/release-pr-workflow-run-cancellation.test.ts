import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    captureRequests,
    createClient,
    createRecordedRouteFetch,
    emptyResponse,
    jsonResponse,
    requestHasSearchParameter,
    routeKey
} from '../../test-libraries/release-pr-github-client-test-support.ts';

suite('release-pr-workflow-run-cancellation', function () {
    test('cancels active dispatched workflow runs for a release branch', async function () {
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
                                { database_id: 21, event: 'workflow_dispatch', status: 'in_progress' },
                                { database_id: 22, event: 'workflow_dispatch', status: 'pending' },
                                { database_id: 23, event: 'workflow_dispatch', status: 'queued' },
                                { database_id: 24, event: 'workflow_dispatch', status: 'requested' },
                                { database_id: 25, event: 'workflow_dispatch', status: 'waiting' },
                                { event: 'workflow_dispatch', status: 'waiting' },
                                { database_id: 26, event: 'workflow_dispatch', status: 'completed' },
                                { database_id: 27, event: 'pull_request', status: 'waiting' }
                            ]
                        });
                    } ],
                    [ routeKey('POST', '/repos/owner/repo/actions/runs/21/cancel'), emptyResponse ],
                    [ routeKey('POST', '/repos/owner/repo/actions/runs/22/cancel'), emptyResponse ],
                    [ routeKey('POST', '/repos/owner/repo/actions/runs/23/cancel'), emptyResponse ],
                    [ routeKey('POST', '/repos/owner/repo/actions/runs/24/cancel'), emptyResponse ],
                    [ routeKey('POST', '/repos/owner/repo/actions/runs/25/cancel'), emptyResponse ]
                ])
            )
        );

        const activeRunIds = await client.cancelActiveDispatchedWorkflowRuns({
            branch: 'release/packtory',
            workflowFile: 'ci.yml'
        });

        assert.deepStrictEqual(activeRunIds, [ 21, 22, 23, 24, 25 ]);
        assert.deepStrictEqual(
            records
                .filter(function (record) {
                    return record.method === 'POST';
                })
                .map(function (record) {
                    return record.path;
                }),
            [
                '/repos/owner/repo/actions/runs/21/cancel',
                '/repos/owner/repo/actions/runs/22/cancel',
                '/repos/owner/repo/actions/runs/23/cancel',
                '/repos/owner/repo/actions/runs/24/cancel',
                '/repos/owner/repo/actions/runs/25/cancel'
            ]
        );
        assert.ok(records.some(function (record) {
            return (
                record.path === '/repos/owner/repo/actions/workflows/101/runs' &&
                requestHasSearchParameter(record, 'branch', 'release/packtory') &&
                requestHasSearchParameter(record, 'event', 'workflow_dispatch')
            );
        }));
    });

    test('returns deleted action-required pull request run ids', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(
            createRecordedRouteFetch(
                capturedRequests,
                new Map([
                    [ routeKey('GET', '/repos/owner/repo/actions/runs'), function () {
                        return jsonResponse({
                            workflow_runs: [
                                {
                                    conclusion: 'action_required',
                                    database_id: 10,
                                    event: 'pull_request',
                                    head_sha: 'release-head'
                                },
                                {
                                    conclusion: 'success',
                                    database_id: 11,
                                    event: 'pull_request',
                                    head_sha: 'release-head'
                                }
                            ]
                        });
                    } ],
                    [ routeKey('DELETE', '/repos/owner/repo/actions/runs/10'), emptyResponse ]
                ])
            )
        );

        assert.deepStrictEqual(
            await client.deleteActionRequiredPullRequestRuns({ branch: 'release/packtory', headSha: 'release-head' }),
            [ 10 ]
        );
        assert.ok(records.some(function (record) {
            return (
                record.path === '/repos/owner/repo/actions/runs' &&
                requestHasSearchParameter(record, 'branch', 'release/packtory') &&
                requestHasSearchParameter(record, 'event', 'pull_request')
            );
        }));
    });
});
