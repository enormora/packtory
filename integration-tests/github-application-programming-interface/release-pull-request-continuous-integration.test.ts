import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    countRequests,
    dispatchPath,
    dispatchRoute,
    okStatus,
    releaseContinuousIntegrationScenario,
    repositoryWorkflowRunsPath,
    runReleaseContinuousIntegration,
    staleRunCancelPath,
    statusesFor,
    statusRoute,
    successfulReleaseContinuousIntegrationScenario,
    workflowListRoute,
    workflowRunsPath,
    workflowRunsSearch
} from './release-workflow-scenarios.ts';
import {
    withDeterministicGitHubApplicationProgrammingInterfaceServer
} from './with-deterministic-github-application-programming-interface-server.ts';

suite('release-pull-request-ci GitHub API integration', function () {
    test(
        'dispatches a fresh workflow run and mirrors a successful required job',
        withDeterministicGitHubApplicationProgrammingInterfaceServer(
            successfulReleaseContinuousIntegrationScenario(),
            async function (server) {
                assert.strictEqual(await runReleaseContinuousIntegration(server, [ 'Node.js v24.x' ]), true);

                assert.deepStrictEqual(
                    statusesFor(server.requests(), 'Node.js v24.x').map(function (status) {
                        return {
                            description: status.description,
                            state: status.state,
                            targetAddress: status.target_url
                        };
                    }),
                    [
                        {
                            description: 'Waiting for dispatched release CI.',
                            state: 'pending',
                            targetAddress: null
                        },
                        {
                            description: 'Dispatched release CI job success.',
                            state: 'success',
                            targetAddress: 'https://github.com/owner/repo/actions/runs/8/job/1'
                        }
                    ]
                );
            }
        )
    );

    test(
        'dispatches fresh CI and mirrors running and final job statuses',
        withDeterministicGitHubApplicationProgrammingInterfaceServer(
            releaseContinuousIntegrationScenario,
            async function (server) {
                assert.strictEqual(
                    await runReleaseContinuousIntegration(server, [ 'Node.js v24.x', 'Mutation testing' ]),
                    true
                );

                assert.strictEqual(countRequests(server.requests(), 'POST', staleRunCancelPath), 1);
                assert.strictEqual(countRequests(server.requests(), 'POST', dispatchPath), 1);
                assert.strictEqual(countRequests(server.requests(), 'GET', workflowRunsPath), 5);
                assert.deepStrictEqual(
                    statusesFor(server.requests(), 'Node.js v24.x').map(function (status) {
                        return {
                            description: status.description,
                            state: status.state,
                            targetAddress: status.target_url
                        };
                    }),
                    [
                        {
                            description: 'Waiting for dispatched release CI.',
                            state: 'pending',
                            targetAddress: null
                        },
                        {
                            description: 'Dispatched release CI job running.',
                            state: 'pending',
                            targetAddress: 'https://github.com/owner/repo/actions/runs/8/job/1'
                        },
                        {
                            description: 'Dispatched release CI job success.',
                            state: 'success',
                            targetAddress: 'https://github.com/owner/repo/actions/runs/8/job/1'
                        }
                    ]
                );
                assert.deepStrictEqual(
                    statusesFor(server.requests(), 'Mutation testing').map(function (status) {
                        return {
                            description: status.description,
                            state: status.state,
                            targetAddress: status.target_url
                        };
                    }),
                    [
                        {
                            description: 'Waiting for dispatched release CI.',
                            state: 'pending',
                            targetAddress: null
                        },
                        {
                            description: 'Dispatched release CI job running.',
                            state: 'pending',
                            targetAddress: 'https://github.com/owner/repo/actions/runs/8/job/2'
                        },
                        {
                            description: 'Dispatched release CI job success.',
                            state: 'success',
                            targetAddress: 'https://github.com/owner/repo/actions/runs/8/job/2'
                        }
                    ]
                );
            }
        )
    );

    test(
        'mirrors missing required jobs as failed statuses',
        withDeterministicGitHubApplicationProgrammingInterfaceServer(
            successfulReleaseContinuousIntegrationScenario(),
            async function (server) {
                assert.strictEqual(
                    await runReleaseContinuousIntegration(server, [ 'Node.js v24.x', 'Missing job' ]),
                    false
                );

                assert.deepStrictEqual(statusesFor(server.requests(), 'Missing job'), [
                    {
                        context: 'Missing job',
                        description: 'Waiting for dispatched release CI.',
                        state: 'pending',
                        target_url: null
                    },
                    {
                        context: 'Missing job',
                        description: 'Missing dispatched release CI job: Missing job.',
                        state: 'failure',
                        target_url: 'https://github.com/owner/repo/actions/runs/8'
                    }
                ]);
            }
        )
    );

    test(
        'marks statuses as failed when a dispatched workflow run is never created',
        withDeterministicGitHubApplicationProgrammingInterfaceServer({
            requestRoutes: [
                workflowListRoute(),
                {
                    method: 'GET',
                    path: workflowRunsPath,
                    search: workflowRunsSearch,
                    response: { status: okStatus, body: { workflow_runs: [] } }
                },
                {
                    method: 'GET',
                    path: repositoryWorkflowRunsPath,
                    search: workflowRunsSearch,
                    response: { status: okStatus, body: { workflow_runs: [] } }
                },
                dispatchRoute(),
                statusRoute()
            ],
            graphqlRoutes: []
        }, async function (server) {
            await assert.rejects(
                runReleaseContinuousIntegration(server, [ 'Node.js v24.x' ]),
                /Release workflow run was not created/u
            );

            assert.deepStrictEqual(statusesFor(server.requests(), 'Node.js v24.x'), [
                {
                    context: 'Node.js v24.x',
                    description: 'Waiting for dispatched release CI.',
                    state: 'pending',
                    target_url: null
                },
                {
                    context: 'Node.js v24.x',
                    description: 'Dispatched release CI did not start.',
                    state: 'error',
                    target_url: null
                }
            ]);
        })
    );
});
