export type DeterministicGitHubApiResponse = {
    readonly status: number;
    readonly body: Readonly<Record<string, unknown>> | readonly unknown[];
};

export type DeterministicGitHubRestRoute = {
    readonly method: string;
    readonly path: string;
    readonly search: string;
    readonly response: DeterministicGitHubApiResponse;
};

export type DeterministicGitHubGraphqlRoute = {
    readonly operationName: string;
    readonly response: DeterministicGitHubApiResponse;
};

export type DeterministicGitHubApiScenario = {
    readonly restRoutes: readonly DeterministicGitHubRestRoute[];
    readonly graphqlRoutes: readonly DeterministicGitHubGraphqlRoute[];
};

const okStatus = 200;
const acceptedStatus = 202;
const serverErrorStatus = 500;

export const pullRequestScenario: DeterministicGitHubApiScenario = {
    restRoutes: [
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

export const repositoryGraphqlScenario: DeterministicGitHubApiScenario = {
    restRoutes: [],
    graphqlRoutes: [
        {
            operationName: 'RepositoryId',
            response: {
                status: okStatus,
                body: {
                    data: {
                        repository: {
                            id: 'R_123'
                        }
                    }
                }
            }
        }
    ]
};

export const failingGitHubScenario: DeterministicGitHubApiScenario = {
    restRoutes: [
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
