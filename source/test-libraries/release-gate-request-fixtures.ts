import {
    createGitHubReleaseGateApplicationProgrammingInterface,
    type GitHubReleaseGateApplicationProgrammingInterface
} from '../github-release-gate/github-application-programming-interface.ts';
import type { MainContinuousIntegrationRunStatus } from '../github-release-gate/release-gate.ts';
import type { GitHubRepositoryContext } from '../github-release-gate/runner-configuration.ts';
import {
    continuousIntegrationRunsPath,
    createBaseRoutes,
    timelinePath,
    type RouteResponse
} from './github-release-gate-test-support.ts';
import { toGitHubResponse } from './github-response.ts';

export type MockRoute = RouteResponse & {
    readonly statusText?: string;
};

export type RecordedRequest = {
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly address: string;
};

export const defaultContext: GitHubRepositoryContext = {
    applicationProgrammingInterfaceBaseAddress: 'https://api.github.com',
    defaultBranch: 'main',
    owner: 'enormora',
    repository: 'packtory',
    token: 'token'
};

function getRequestAddress(input: RequestInfo | URL): string {
    if (input instanceof URL) {
        return input.href;
    }

    if (typeof input === 'string') {
        return input;
    }

    return input.url;
}

export type MockRouteMap = Readonly<Record<string, MockRoute>>;

export type OpenPullRequestActivities = Awaited<
    ReturnType<GitHubReleaseGateApplicationProgrammingInterface['getOpenPullRequestActivities']>
>;

type RecordedRequestWithAddress = {
    readonly request: RecordedRequest;
    readonly address: URL;
};

function createRecordedRequest(
    input: RequestInfo | URL,
    initialization: Readonly<RequestInit> | undefined
): RecordedRequestWithAddress {
    const address = new URL(getRequestAddress(input));
    const headers = new Headers(initialization?.headers);

    return {
        address,
        request: {
            headers: {
                accept: headers.get('Accept') ?? undefined,
                authorization: headers.get('Authorization') ?? undefined,
                'user-agent': headers.get('User-Agent') ?? undefined,
                'x-github-api-version': headers.get('X-GitHub-Api-Version') ?? undefined
            },
            address: `${address.pathname}${address.search}`
        }
    };
}

function createMockRouteResponse(route: MockRoute): Response {
    const responseInitialization: ResponseInit = {
        status: route.status ?? 200,
        ...route.headers === undefined ? {} : { headers: route.headers },
        ...route.statusText === undefined ? {} : { statusText: route.statusText }
    };

    return Response.json(toGitHubResponse(route.body), responseInitialization);
}

export function createJavaScriptObjectNotationFetch(
    routes: MockRouteMap,
    requests: RecordedRequest[] = []
): typeof globalThis.fetch {
    return async function (input, initialization) {
        const { request, address } = createRecordedRequest(input, initialization);
        requests.push(request);
        const route = routes[`${address.pathname}${address.search}`];

        if (route === undefined) {
            throw new Error(`Unexpected fetch URL: ${address}`);
        }

        return createMockRouteResponse(route);
    };
}

export async function getOpenPullRequestActivitiesForTimeline(
    timelineBody: readonly unknown[]
): Promise<OpenPullRequestActivities> {
    const routes = createBaseRoutes() as Record<string, MockRoute>;
    routes[timelinePath] = { body: timelineBody };

    return await createGitHubReleaseGateApplicationProgrammingInterface(
        createJavaScriptObjectNotationFetch(routes),
        defaultContext
    )
        .getOpenPullRequestActivities();
}

export function withContinuousIntegrationWorkflowRuns(workflowRuns: readonly unknown[]): Record<string, MockRoute> {
    const routes = createBaseRoutes() as Record<string, MockRoute>;
    routes[continuousIntegrationRunsPath] = { body: { workflow_runs: workflowRuns } };
    return routes;
}

export async function runGetMainContinuousIntegrationRunStatus(
    routes: Readonly<Record<string, MockRoute>>
): Promise<MainContinuousIntegrationRunStatus> {
    return await createGitHubReleaseGateApplicationProgrammingInterface(
        createJavaScriptObjectNotationFetch(routes),
        defaultContext
    )
        .getMainContinuousIntegrationRunStatus(
            'continuous-integration.yml',
            'abc123'
        );
}
