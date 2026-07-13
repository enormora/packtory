import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type {
    DeterministicGitHubApiResponse,
    DeterministicGitHubApiScenario,
    DeterministicGitHubGraphqlRoute,
    DeterministicGitHubRestRoute
} from './deterministic-github-api-scenarios.ts';

export type DeterministicGitHubApiRequest = {
    readonly body: string;
    readonly method: string;
    readonly path: string;
    readonly search: string;
};

export type DeterministicGitHubApiServer = {
    readonly baseUrl: string;
    readonly graphqlUrl: string;
    readonly requests: () => readonly DeterministicGitHubApiRequest[];
    readonly stop: () => Promise<void>;
};

export type DeterministicGitHubApiServerOptions = {
    readonly port: number;
    readonly scenario: DeterministicGitHubApiScenario;
};

const notFoundStatus = 404;
const internalServerErrorStatus = 500;

type DeterministicGitHubApiState = {
    readonly recordRequest: (request: DeterministicGitHubApiRequest) => void;
    readonly scenario: DeterministicGitHubApiScenario;
};

type RecordedIncomingRequest = {
    readonly body: string;
    readonly method: string;
    readonly path: string;
    readonly search: string;
};

function writeJson(response: ServerResponse, apiResponse: DeterministicGitHubApiResponse): void {
    response.writeHead(apiResponse.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(apiResponse.body));
}

function notFoundResponse(method: string, path: string): DeterministicGitHubApiResponse {
    return {
        status: notFoundStatus,
        body: {
            message: `No deterministic GitHub API route for ${method} ${path}`
        }
    };
}

function restRouteMatches(route: DeterministicGitHubRestRoute, request: RecordedIncomingRequest): boolean {
    return route.method === request.method && route.path === request.path && route.search === request.search;
}

function findRestRoute(
    scenario: DeterministicGitHubApiScenario,
    request: RecordedIncomingRequest
): DeterministicGitHubRestRoute | undefined {
    return scenario.restRoutes.find(function (route) {
        return restRouteMatches(route, request);
    });
}

function operationNameFrom(body: string): string | undefined {
    const parsedBody = JSON.parse(body) as Readonly<Record<string, unknown>>;
    return typeof parsedBody.operationName === 'string' ? parsedBody.operationName : undefined;
}

function findGraphqlRoute(
    scenario: DeterministicGitHubApiScenario,
    body: string
): DeterministicGitHubGraphqlRoute | undefined {
    const operationName = operationNameFrom(body);
    return scenario.graphqlRoutes.find(function (route) {
        return route.operationName === operationName;
    });
}

function graphqlResponse(
    state: DeterministicGitHubApiState,
    request: RecordedIncomingRequest
): DeterministicGitHubApiResponse {
    return findGraphqlRoute(state.scenario, request.body)?.response ??
        notFoundResponse(request.method, request.path);
}

function restResponse(
    state: DeterministicGitHubApiState,
    request: RecordedIncomingRequest
): DeterministicGitHubApiResponse {
    return findRestRoute(state.scenario, request)?.response ?? notFoundResponse(request.method, request.path);
}

function routeResponse(
    state: DeterministicGitHubApiState,
    request: RecordedIncomingRequest
): DeterministicGitHubApiResponse {
    if (request.method === 'POST' && request.path === '/graphql') {
        return graphqlResponse(state, request);
    }
    return restResponse(state, request);
}

function recordIncomingRequest(request: IncomingMessage, body: string): RecordedIncomingRequest {
    const url = new URL(request.url ?? '/', 'http://localhost');
    return {
        body,
        method: request.method ?? 'GET',
        path: url.pathname,
        search: url.search
    };
}

function writeUnexpectedError(response: ServerResponse, error: unknown): void {
    writeJson(response, {
        status: internalServerErrorStatus,
        body: { message: error instanceof Error ? error.message : 'Unexpected server error' }
    });
}

function routeRequest(
    state: DeterministicGitHubApiState,
    request: IncomingMessage,
    response: ServerResponse
): void {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', function (chunk: string) {
        body += chunk;
    });
    request.on('error', function (error: unknown) {
        writeUnexpectedError(response, error);
    });
    request.on('end', function () {
        const recordedRequest = recordIncomingRequest(request, body);
        state.recordRequest(recordedRequest);
        writeJson(response, routeResponse(state, recordedRequest));
    });
}

async function listen(server: Server, port: number): Promise<void> {
    await new Promise<void>(function (resolve) {
        server.listen(port, '127.0.0.1', resolve);
    });
}

async function close(server: Server): Promise<void> {
    await new Promise<void>(function (resolve) {
        server.close(function () {
            resolve();
        });
    });
}

function serverUrl(port: number): string {
    return `http://127.0.0.1:${port}`;
}

export async function createDeterministicGitHubApiServer(
    options: DeterministicGitHubApiServerOptions
): Promise<DeterministicGitHubApiServer> {
    let requests: readonly DeterministicGitHubApiRequest[] = [];
    const server = createServer(function (request, response) {
        routeRequest(
            {
                scenario: options.scenario,
                recordRequest(recordedRequest) {
                    requests = [ ...requests, recordedRequest ];
                }
            },
            request,
            response
        );
    });

    await listen(server, options.port);

    return {
        baseUrl: serverUrl(options.port),
        graphqlUrl: `${serverUrl(options.port)}/graphql`,
        requests() {
            return requests;
        },
        async stop() {
            await close(server);
        }
    };
}
