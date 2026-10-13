import { fake } from 'sinon';
import type { ReleasePullRequestConfiguration } from '../../source/command-line-interface/runner/release-pull-request-configuration.ts';
import { runConfiguredGitHubActionsContinuousIntegration } from '../../source/command-line-interface/runner/release-pull-request-continuous-integration.ts';
import {
    createReleasePullRequestGitHubClient,
    type ReleasePullRequestGitHubClient
} from '../../source/command-line-interface/runner/release-pull-request-github-client.ts';
import type {
    DeterministicGitHubApplicationProgrammingInterfaceRequest,
    DeterministicGitHubApplicationProgrammingInterfaceScenario
} from './deterministic-github-application-programming-interface-scenarios.ts';
import type {
    DeterministicGitHubApplicationProgrammingInterfaceServerContext
} from './with-deterministic-github-application-programming-interface-server.ts';

export const acceptedStatus = 202;

export const okStatus = 200;

export const noContentStatus = 204;

export const releaseBranch = 'release/packtory';

export const statusPath = '/repos/owner/repo/statuses/release-head';

export const workflowRunsPath = '/repos/owner/repo/actions/workflows/101/runs';

export const repositoryWorkflowRunsPath = '/repos/owner/repo/actions/runs';

export const dispatchPath = '/repos/owner/repo/actions/workflows/101/dispatches';

export const runPath = '/repos/owner/repo/actions/runs/8';

export const jobsPath = '/repos/owner/repo/actions/runs/8/jobs';

export const staleRunCancelPath = '/repos/owner/repo/actions/runs/7/cancel';

export type StatusRequestBody = {
    readonly context: string;
    readonly description: string;
    readonly state: string;
    readonly target_url: string | null;
};

export function searchString(parameters: Readonly<Record<string, string>>): string {
    const searchParameters = new URLSearchParams(parameters);
    return `?${searchParameters.toString()}`;
}

export const workflowRunsSearch = searchString({ branch: releaseBranch, event: 'workflow_dispatch', per_page: '100' });

export function countRequests(
    requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[],
    method: string,
    path: string
): number {
    return requests
        .filter(function (request) {
            return request.method === method && request.path === path;
        })
        .length;
}

export function dispatchIndex(requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[]): number {
    return requests.findIndex(function (request) {
        return request.method === 'POST' && request.path === dispatchPath;
    });
}

export function workflowRunsAfterDispatch(
    requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[]
): number {
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

export function workflowRunsBody(
    requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[]
): Record<string, unknown> {
    const oldRun = {
        database_id: 7,
        event: 'workflow_dispatch',
        head_sha: 'release-head',
        status: 'in_progress',
        workflow_id: 101
    };
    const canceledOldRun = { ...oldRun, conclusion: 'cancelled', status: 'completed' };
    if (countRequests(requests, 'POST', staleRunCancelPath) === 0) {
        return { workflow_runs: [ oldRun ] };
    }
    if (dispatchIndex(requests) === -1) {
        return { workflow_runs: [ canceledOldRun ] };
    }
    if (workflowRunsAfterDispatch(requests) < 2) {
        return { workflow_runs: [ canceledOldRun ] };
    }
    return {
        workflow_runs: [
            canceledOldRun,
            {
                database_id: 8,
                event: 'workflow_dispatch',
                head_sha: 'release-head',
                workflow_id: 101
            }
        ]
    };
}

export function runResultBody(
    requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[]
): Record<string, unknown> {
    return {
        conclusion: countRequests(requests, 'GET', runPath) === 1 ? null : 'success',
        html_url: 'https://github.com/owner/repo/actions/runs/8'
    };
}

export function jobsBody(
    requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[]
): Record<string, unknown> {
    const conclusion = countRequests(requests, 'GET', jobsPath) === 1 ? null : 'success';
    return {
        jobs: [
            { conclusion, html_url: 'https://github.com/owner/repo/actions/runs/8/job/1', name: 'Node.js v24.x' },
            { conclusion, html_url: 'https://github.com/owner/repo/actions/runs/8/job/2', name: 'Mutation testing' }
        ],
        total_count: 2
    };
}

export function workflowListRoute(): DeterministicGitHubApplicationProgrammingInterfaceScenario['requestRoutes'][
    number
] {
    return {
        method: 'GET',
        path: '/repos/owner/repo/actions/workflows',
        search: '?per_page=100',
        response: {
            status: okStatus,
            body: {
                workflows: [ {
                    identifier: 101,
                    name: 'Continuous integration',
                    path: '.github/workflows/continuous-integration.yml'
                } ]
            }
        }
    };
}

export function dispatchRoute(): DeterministicGitHubApplicationProgrammingInterfaceScenario['requestRoutes'][number] {
    return {
        method: 'POST',
        path: dispatchPath,
        search: '',
        response: { status: noContentStatus, body: {} }
    };
}

export function cancelStaleRunRoute(): DeterministicGitHubApplicationProgrammingInterfaceScenario['requestRoutes'][
    number
] {
    return {
        method: 'POST',
        path: staleRunCancelPath,
        search: '',
        response: { status: acceptedStatus, body: {} }
    };
}

export function statusRoute(): DeterministicGitHubApplicationProgrammingInterfaceScenario['requestRoutes'][number] {
    return {
        method: 'POST',
        path: statusPath,
        search: '',
        response: { status: acceptedStatus, body: {} }
    };
}

export function completedRunRoute(): DeterministicGitHubApplicationProgrammingInterfaceScenario['requestRoutes'][
    number
] {
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

export function successfulJobsRoute(): DeterministicGitHubApplicationProgrammingInterfaceScenario['requestRoutes'][
    number
] {
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

export function immediateWorkflowRunBody(
    requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[]
): Record<string, unknown> {
    if (dispatchIndex(requests) === -1) {
        return { workflow_runs: [] };
    }
    return {
        workflow_runs: [
            { database_id: 8, event: 'workflow_dispatch', head_sha: 'release-head', workflow_id: 101 }
        ]
    };
}

export function immediateWorkflowRunRoute(): DeterministicGitHubApplicationProgrammingInterfaceScenario[
    'requestRoutes'
][
    number
] {
    return {
        method: 'GET',
        path: workflowRunsPath,
        search: workflowRunsSearch,
        response(requests) {
            return { status: okStatus, body: immediateWorkflowRunBody(requests) };
        }
    };
}

export function immediateRepositoryWorkflowRunRoute(): DeterministicGitHubApplicationProgrammingInterfaceScenario[
    'requestRoutes'
][number] {
    return {
        method: 'GET',
        path: repositoryWorkflowRunsPath,
        search: workflowRunsSearch,
        response(requests) {
            return { status: okStatus, body: immediateWorkflowRunBody(requests) };
        }
    };
}

type WorkflowScenario = DeterministicGitHubApplicationProgrammingInterfaceScenario;

export function successfulReleaseContinuousIntegrationScenario(): WorkflowScenario {
    return {
        requestRoutes: [
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

export const releaseContinuousIntegrationScenario: DeterministicGitHubApplicationProgrammingInterfaceScenario = {
    requestRoutes: [
        workflowListRoute(),
        {
            method: 'GET',
            path: workflowRunsPath,
            search: workflowRunsSearch,
            response(requests) {
                return { status: okStatus, body: workflowRunsBody(requests) };
            }
        },
        cancelStaleRunRoute(),
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

export function readStatusRequests(
    requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[]
): readonly StatusRequestBody[] {
    return requests
        .filter(function (request) {
            return request.method === 'POST' && request.path === statusPath;
        })
        .map(function (request) {
            return JSON.parse(request.body) as StatusRequestBody;
        });
}

export function statusesFor(
    requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[],
    context: string
): readonly StatusRequestBody[] {
    return readStatusRequests(requests).filter(function (status) {
        return status.context === context;
    });
}

export function releaseContinuousIntegrationConfiguration(
    requiredStatusContexts: readonly string[]
): ReleasePullRequestConfiguration {
    return {
        automationAuthor: 'github-actions[bot]',
        body: 'Body',
        branch: releaseBranch,
        commitSubject: 'Release packages',
        defaultBranch: 'main',
        githubActionsContinuousIntegration: {
            deleteActionRequiredPullRequestRuns: false,
            requiredStatusContexts,
            workflowFile: 'continuous-integration.yml'
        },
        label: 'release',
        title: 'Prepare release'
    };
}

export function createClient(
    server: DeterministicGitHubApplicationProgrammingInterfaceServerContext
): ReleasePullRequestGitHubClient {
    return createReleasePullRequestGitHubClient({
        applicationProgrammingInterfaceBaseAddress: server.baseAddress,
        fetch,
        owner: 'owner',
        repository: 'repo',
        token: 'token'
    });
}

export async function runReleaseContinuousIntegration(
    server: DeterministicGitHubApplicationProgrammingInterfaceServerContext,
    requiredStatusContexts: readonly string[]
): Promise<boolean> {
    return runConfiguredGitHubActionsContinuousIntegration({
        client: createClient(server),
        configuration: releaseContinuousIntegrationConfiguration(requiredStatusContexts),
        headHash: 'release-head',
        sleep: fake.resolves(undefined)
    });
}
