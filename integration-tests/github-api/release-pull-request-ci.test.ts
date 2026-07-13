import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { ReleasePullRequestConfig } from '../../source/command-line-interface/runner/release-pull-request-config.ts';
import { runConfiguredGitHubActionsCi } from '../../source/command-line-interface/runner/release-pull-request-ci.ts';
import {
    createReleasePullRequestGitHubClient,
    type ReleasePullRequestGitHubClient
} from '../../source/command-line-interface/runner/release-pr-github-client.ts';
import type {
    DeterministicGitHubApiRequest,
    DeterministicGitHubApiScenario
} from './deterministic-github-api-scenarios.ts';
import {
    type DeterministicGitHubApiServerContext,
    withDeterministicGitHubApiServer
} from './with-deterministic-github-api-server.ts';

const acceptedStatus = 202;
const okStatus = 200;
const noContentStatus = 204;
const releaseBranch = 'release/packtory';
const statusPath = '/repos/owner/repo/statuses/release-head';
const workflowRunsPath = '/repos/owner/repo/actions/workflows/101/runs';
const repositoryWorkflowRunsPath = '/repos/owner/repo/actions/runs';
const dispatchPath = '/repos/owner/repo/actions/workflows/101/dispatches';
const runPath = '/repos/owner/repo/actions/runs/8';
const jobsPath = '/repos/owner/repo/actions/runs/8/jobs';

type StatusRequestBody = {
    readonly context: string;
    readonly description: string;
    readonly state: string;
    readonly target_url: string | null;
};

function searchString(parameters: Readonly<Record<string, string>>): string {
    const searchParameters = new URLSearchParams(parameters);
    return `?${searchParameters.toString()}`;
}

const workflowRunsSearch = searchString({ branch: releaseBranch, event: 'workflow_dispatch', per_page: '100' });

function countRequests(requests: readonly DeterministicGitHubApiRequest[], method: string, path: string): number {
    return requests
        .filter(function (request) {
            return request.method === method && request.path === path;
        })
        .length;
}

function dispatchIndex(requests: readonly DeterministicGitHubApiRequest[]): number {
    return requests.findIndex(function (request) {
        return request.method === 'POST' && request.path === dispatchPath;
    });
}

function workflowRunsAfterDispatch(requests: readonly DeterministicGitHubApiRequest[]): number {
    const index = dispatchIndex(requests);
    if (index === -1) {
        return 0;
    }
    return requests
        .slice(index + 1)
        .filter(function (request) {
            return request.method === 'GET' && request.path === workflowRunsPath;
        })
        .length;
}

function workflowRunsBody(requests: readonly DeterministicGitHubApiRequest[]): Record<string, unknown> {
    const oldRun = {
        database_id: 7,
        event: 'workflow_dispatch',
        head_sha: 'release-head',
        workflow_id: 101
    };
    if (workflowRunsAfterDispatch(requests) < 2) {
        return { workflow_runs: [ oldRun ] };
    }
    return {
        workflow_runs: [
            oldRun,
            {
                database_id: 8,
                event: 'workflow_dispatch',
                head_sha: 'release-head',
                workflow_id: 101
            }
        ]
    };
}

function runResultBody(requests: readonly DeterministicGitHubApiRequest[]): Record<string, unknown> {
    return {
        conclusion: countRequests(requests, 'GET', runPath) === 1 ? null : 'success',
        html_url: 'https://github.com/owner/repo/actions/runs/8'
    };
}

function jobsBody(requests: readonly DeterministicGitHubApiRequest[]): Record<string, unknown> {
    const conclusion = countRequests(requests, 'GET', jobsPath) === 1 ? null : 'success';
    return {
        jobs: [
            { conclusion, html_url: 'https://github.com/owner/repo/actions/runs/8/job/1', name: 'Node.js v24.x' },
            { conclusion, html_url: 'https://github.com/owner/repo/actions/runs/8/job/2', name: 'Mutation testing' }
        ],
        total_count: 2
    };
}

function workflowListRoute(): DeterministicGitHubApiScenario['restRoutes'][number] {
    return {
        method: 'GET',
        path: '/repos/owner/repo/actions/workflows',
        search: '?per_page=100',
        response: {
            status: okStatus,
            body: {
                workflows: [ { id: 101, name: 'Continuous integration', path: '.github/workflows/ci.yml' } ]
            }
        }
    };
}

function dispatchRoute(): DeterministicGitHubApiScenario['restRoutes'][number] {
    return {
        method: 'POST',
        path: dispatchPath,
        search: '',
        response: { status: noContentStatus, body: {} }
    };
}

function statusRoute(): DeterministicGitHubApiScenario['restRoutes'][number] {
    return {
        method: 'POST',
        path: statusPath,
        search: '',
        response: { status: acceptedStatus, body: {} }
    };
}

function completedRunRoute(): DeterministicGitHubApiScenario['restRoutes'][number] {
    return {
        method: 'GET',
        path: runPath,
        search: '',
        response: {
            status: okStatus,
            body: {
                conclusion: 'success',
                html_url: 'https://github.com/owner/repo/actions/runs/8'
            }
        }
    };
}

function successfulJobsRoute(): DeterministicGitHubApiScenario['restRoutes'][number] {
    return {
        method: 'GET',
        path: jobsPath,
        search: '?per_page=100',
        response: {
            status: okStatus,
            body: {
                jobs: [
                    {
                        conclusion: 'success',
                        html_url: 'https://github.com/owner/repo/actions/runs/8/job/1',
                        name: 'Node.js v24.x'
                    }
                ],
                total_count: 1
            }
        }
    };
}

function immediateWorkflowRunBody(requests: readonly DeterministicGitHubApiRequest[]): Record<string, unknown> {
    if (dispatchIndex(requests) === -1) {
        return { workflow_runs: [] };
    }
    return {
        workflow_runs: [
            { database_id: 8, event: 'workflow_dispatch', head_sha: 'release-head', workflow_id: 101 }
        ]
    };
}

function immediateWorkflowRunRoute(): DeterministicGitHubApiScenario['restRoutes'][number] {
    return {
        method: 'GET',
        path: workflowRunsPath,
        search: workflowRunsSearch,
        response(requests) {
            return { status: okStatus, body: immediateWorkflowRunBody(requests) };
        }
    };
}

function immediateRepositoryWorkflowRunRoute(): DeterministicGitHubApiScenario['restRoutes'][number] {
    return {
        method: 'GET',
        path: repositoryWorkflowRunsPath,
        search: workflowRunsSearch,
        response(requests) {
            return { status: okStatus, body: immediateWorkflowRunBody(requests) };
        }
    };
}

function successfulReleaseCiScenario(): DeterministicGitHubApiScenario {
    return {
        restRoutes: [
            workflowListRoute(),
            immediateWorkflowRunRoute(),
            immediateRepositoryWorkflowRunRoute(),
            dispatchRoute(),
            completedRunRoute(),
            successfulJobsRoute(),
            statusRoute()
        ],
        graphqlRoutes: []
    };
}

const releaseCiScenario: DeterministicGitHubApiScenario = {
    restRoutes: [
        workflowListRoute(),
        {
            method: 'GET',
            path: workflowRunsPath,
            search: workflowRunsSearch,
            response(requests) {
                return { status: okStatus, body: workflowRunsBody(requests) };
            }
        },
        dispatchRoute(),
        {
            method: 'GET',
            path: repositoryWorkflowRunsPath,
            search: workflowRunsSearch,
            response(requests) {
                return { status: okStatus, body: workflowRunsBody(requests) };
            }
        },
        {
            method: 'GET',
            path: runPath,
            search: '',
            response(requests) {
                return { status: okStatus, body: runResultBody(requests) };
            }
        },
        {
            method: 'GET',
            path: jobsPath,
            search: '?per_page=100',
            response(requests) {
                return { status: okStatus, body: jobsBody(requests) };
            }
        },
        statusRoute()
    ],
    graphqlRoutes: []
};

function readStatusRequests(requests: readonly DeterministicGitHubApiRequest[]): readonly StatusRequestBody[] {
    return requests
        .filter(function (request) {
            return request.method === 'POST' && request.path === statusPath;
        })
        .map(function (request) {
            return JSON.parse(request.body) as StatusRequestBody;
        });
}

function statusesFor(
    requests: readonly DeterministicGitHubApiRequest[],
    context: string
): readonly StatusRequestBody[] {
    return readStatusRequests(requests).filter(function (status) {
        return status.context === context;
    });
}

function releaseCiConfig(requiredStatusContexts: readonly string[]): ReleasePullRequestConfig {
    return {
        automationAuthor: 'github-actions[bot]',
        body: 'Body',
        branch: releaseBranch,
        commitSubject: 'Release packages',
        defaultBranch: 'main',
        githubActionsCi: {
            deleteActionRequiredPullRequestRuns: false,
            requiredStatusContexts,
            workflowFile: 'ci.yml'
        },
        label: 'release',
        title: 'Prepare release'
    };
}

function createClient(server: DeterministicGitHubApiServerContext): ReleasePullRequestGitHubClient {
    return createReleasePullRequestGitHubClient({
        apiBaseUrl: server.baseUrl,
        fetch,
        owner: 'owner',
        repo: 'repo',
        token: 'token'
    });
}

async function runReleaseCi(
    server: DeterministicGitHubApiServerContext,
    requiredStatusContexts: readonly string[]
): Promise<boolean> {
    return runConfiguredGitHubActionsCi({
        client: createClient(server),
        config: releaseCiConfig(requiredStatusContexts),
        headSha: 'release-head',
        sleep: fake.resolves(undefined)
    });
}

suite('release-pull-request-ci GitHub API integration', function () {
    test(
        'dispatches a fresh workflow run and mirrors a successful required job',
        withDeterministicGitHubApiServer(successfulReleaseCiScenario(), async function (server) {
            assert.strictEqual(await runReleaseCi(server, [ 'Node.js v24.x' ]), true);

            assert.deepStrictEqual(
                statusesFor(server.requests(), 'Node.js v24.x').map(function (status) {
                    return {
                        description: status.description,
                        state: status.state,
                        targetUrl: status.target_url
                    };
                }),
                [
                    {
                        description: 'Waiting for dispatched release CI.',
                        state: 'pending',
                        targetUrl: null
                    },
                    {
                        description: 'Dispatched release CI job success.',
                        state: 'success',
                        targetUrl: 'https://github.com/owner/repo/actions/runs/8/job/1'
                    }
                ]
            );
        })
    );

    test(
        'dispatches fresh CI and mirrors running and final job statuses',
        withDeterministicGitHubApiServer(releaseCiScenario, async function (server) {
            assert.strictEqual(await runReleaseCi(server, [ 'Node.js v24.x', 'Mutation testing' ]), true);

            assert.strictEqual(countRequests(server.requests(), 'POST', dispatchPath), 1);
            assert.strictEqual(countRequests(server.requests(), 'GET', workflowRunsPath), 3);
            assert.deepStrictEqual(
                statusesFor(server.requests(), 'Node.js v24.x').map(function (status) {
                    return {
                        description: status.description,
                        state: status.state,
                        targetUrl: status.target_url
                    };
                }),
                [
                    {
                        description: 'Waiting for dispatched release CI.',
                        state: 'pending',
                        targetUrl: null
                    },
                    {
                        description: 'Dispatched release CI job running.',
                        state: 'pending',
                        targetUrl: 'https://github.com/owner/repo/actions/runs/8/job/1'
                    },
                    {
                        description: 'Dispatched release CI job success.',
                        state: 'success',
                        targetUrl: 'https://github.com/owner/repo/actions/runs/8/job/1'
                    }
                ]
            );
            assert.deepStrictEqual(
                statusesFor(server.requests(), 'Mutation testing').map(function (status) {
                    return {
                        description: status.description,
                        state: status.state,
                        targetUrl: status.target_url
                    };
                }),
                [
                    {
                        description: 'Waiting for dispatched release CI.',
                        state: 'pending',
                        targetUrl: null
                    },
                    {
                        description: 'Dispatched release CI job running.',
                        state: 'pending',
                        targetUrl: 'https://github.com/owner/repo/actions/runs/8/job/2'
                    },
                    {
                        description: 'Dispatched release CI job success.',
                        state: 'success',
                        targetUrl: 'https://github.com/owner/repo/actions/runs/8/job/2'
                    }
                ]
            );
        })
    );

    test(
        'mirrors missing required jobs as failed statuses',
        withDeterministicGitHubApiServer(successfulReleaseCiScenario(), async function (server) {
            assert.strictEqual(await runReleaseCi(server, [ 'Node.js v24.x', 'Missing job' ]), false);

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
        })
    );

    test(
        'marks statuses as failed when a dispatched workflow run is never created',
        withDeterministicGitHubApiServer({
            restRoutes: [
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
                runReleaseCi(server, [ 'Node.js v24.x' ]),
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
