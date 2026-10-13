export type DeterministicGitHubApplicationProgrammingInterfaceRequest = {
    readonly body: string;
    readonly method: string;
    readonly path: string;
    readonly search: string;
};

export type DeterministicGitHubApplicationProgrammingInterfaceResponse = {
    readonly status: number;
    readonly body: Readonly<Record<string, unknown>> | readonly unknown[];
};

export type DeterministicGitHubApplicationProgrammingInterfaceRouteResponse = (
    requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[]
) => DeterministicGitHubApplicationProgrammingInterfaceResponse;

export type DeterministicGitHubRequestRoute = {
    readonly method: string;
    readonly path: string;
    readonly search: string;
    readonly response: DeterministicGitHubApplicationProgrammingInterfaceResponse;
};

export type DeterministicGitHubRestDynamicRoute = {
    readonly method: string;
    readonly path: string;
    readonly search: string;
    readonly response: DeterministicGitHubApplicationProgrammingInterfaceRouteResponse;
};

export type DeterministicGitHubGraphqlRoute = {
    readonly operationName: string;
    readonly response: DeterministicGitHubApplicationProgrammingInterfaceResponse;
};

export type DeterministicGitHubGraphqlDynamicRoute = {
    readonly operationName: string;
    readonly response: DeterministicGitHubApplicationProgrammingInterfaceRouteResponse;
};

export type DeterministicGitHubApplicationProgrammingInterfaceScenario = {
    readonly requestRoutes: readonly (DeterministicGitHubRequestRoute | DeterministicGitHubRestDynamicRoute)[];
    readonly graphqlRoutes: readonly (DeterministicGitHubGraphqlDynamicRoute | DeterministicGitHubGraphqlRoute)[];
};

const okStatus = 200;
const acceptedStatus = 202;
const serverErrorStatus = 500;

export const pullRequestScenario: DeterministicGitHubApplicationProgrammingInterfaceScenario = {
    requestRoutes: [
        {
            method: 'GET',
            path: '/repos/owner/repo/pulls/123',
            search: '',
            response: {
                status: okStatus,
                body: {
                    number: 123,
                    title: 'Prepare release'
                }
            }
        },
        {
            method: 'POST',
            path: '/repos/owner/repo/statuses/head-sha',
            search: '',
            response: {
                status: acceptedStatus,
                body: {
                    state: 'pending'
                }
            }
        }
    ],
    graphqlRoutes: []
};

export const repositoryGraphqlScenario: DeterministicGitHubApplicationProgrammingInterfaceScenario = {
    requestRoutes: [],
    graphqlRoutes: [
        {
            operationName: 'RepositoryId',
            response: {
                status: okStatus,
                body: {
                    data: {
                        repository: {
                            identifier: 'R_123'
                        }
                    }
                }
            }
        }
    ]
};

export const failingGitHubScenario: DeterministicGitHubApplicationProgrammingInterfaceScenario = {
    requestRoutes: [
        {
            method: 'GET',
            path: '/repos/owner/repo/pulls/500',
            search: '',
            response: {
                status: serverErrorStatus,
                body: {
                    message: 'deterministic failure'
                }
            }
        }
    ],
    graphqlRoutes: [
        {
            operationName: 'FailingQuery',
            response: {
                status: serverErrorStatus,
                body: {
                    errors: [
                        {
                            message: 'deterministic graphql failure'
                        }
                    ]
                }
            }
        }
    ]
};
