import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { toGitHubResponse } from '../../source/test-libraries/github-response.ts';
import type {
    DeterministicGitHubApplicationProgrammingInterfaceRequest,
    DeterministicGitHubApplicationProgrammingInterfaceResponse,
    DeterministicGitHubApplicationProgrammingInterfaceRouteResponse,
    DeterministicGitHubApplicationProgrammingInterfaceScenario
} from './deterministic-github-application-programming-interface-scenarios.ts';

export type DeterministicGitHubApplicationProgrammingInterfaceServer = {
    readonly baseAddress: string;
    readonly graphqlAddress: string;
    readonly requests: () => readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[];
    readonly stop: () => Promise<void>;
};

export type DeterministicGitHubApplicationProgrammingInterfaceServerOptions = {
    readonly port: number;
    readonly scenario: DeterministicGitHubApplicationProgrammingInterfaceScenario;
};

const notFoundStatus = 404;
const internalServerErrorStatus = 500;

type DeterministicGitHubApplicationProgrammingInterfaceState = {
    readonly recordRequest: (request: DeterministicGitHubApplicationProgrammingInterfaceRequest) => void;
    readonly requests: () => readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[];
    readonly scenario: DeterministicGitHubApplicationProgrammingInterfaceScenario;
};
type DeterministicGitHubRequestRoute =
    DeterministicGitHubApplicationProgrammingInterfaceScenario['requestRoutes'][number];
type DeterministicGitHubGraphqlRoute =
    DeterministicGitHubApplicationProgrammingInterfaceScenario['graphqlRoutes'][number];
type ServiceResponse = DeterministicGitHubApplicationProgrammingInterfaceResponse;
type ScenarioResponse = DeterministicGitHubApplicationProgrammingInterfaceRouteResponse;
type RouteResponse = ScenarioResponse | ServiceResponse;

type RecordedIncomingRequest = {
    readonly body: string;
    readonly method: string;
    readonly path: string;
    readonly search: string;
};

function writeJavaScriptObjectNotation(
    response: ServerResponse,
    applicationProgrammingInterfaceResponse: DeterministicGitHubApplicationProgrammingInterfaceResponse
): void {
    response.writeHead(applicationProgrammingInterfaceResponse.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(toGitHubResponse(applicationProgrammingInterfaceResponse.body)));
}

function notFoundResponse(method: string, path: string): DeterministicGitHubApplicationProgrammingInterfaceResponse {
    return {
        status: notFoundStatus,
        body: {
            message: `No deterministic GitHub API route for ${method} ${path}`
        }
    };
}

function requestRouteMatches(route: DeterministicGitHubRequestRoute, request: RecordedIncomingRequest): boolean {
    return route.method === request.method && route.path === request.path && route.search === request.search;
}

function findRequestRoute(
    scenario: DeterministicGitHubApplicationProgrammingInterfaceScenario,
    request: RecordedIncomingRequest
): DeterministicGitHubRequestRoute | undefined {
    return scenario.requestRoutes.find(function (route) {
        return requestRouteMatches(route, request);
    });
}

function operationNameFrom(body: string): string | undefined {
    const parsedBody = JSON.parse(body) as Readonly<Record<string, unknown>>;
    return typeof parsedBody.operationName === 'string' ? parsedBody.operationName : undefined;
}

function findGraphqlRoute(
    scenario: DeterministicGitHubApplicationProgrammingInterfaceScenario,
    body: string
): DeterministicGitHubGraphqlRoute | undefined {
    const operationName = operationNameFrom(body);
    return scenario.graphqlRoutes.find(function (route) {
        return route.operationName === operationName;
    });
}

function resolveApplicationProgrammingInterfaceResponse(
    response: RouteResponse,
    requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[]
): DeterministicGitHubApplicationProgrammingInterfaceResponse {
    return typeof response === 'function' ? response(requests) : response;
}

function graphqlResponse(
    state: DeterministicGitHubApplicationProgrammingInterfaceState,
    request: RecordedIncomingRequest
): DeterministicGitHubApplicationProgrammingInterfaceResponse {
    const response = findGraphqlRoute(state.scenario, request.body)?.response;
    return response === undefined
        ? notFoundResponse(request.method, request.path)
        : resolveApplicationProgrammingInterfaceResponse(
            response,
            state.requests()
        );
}

function requestResponse(
    state: DeterministicGitHubApplicationProgrammingInterfaceState,
    request: RecordedIncomingRequest
): DeterministicGitHubApplicationProgrammingInterfaceResponse {
    const response = findRequestRoute(state.scenario, request)?.response;
    return response === undefined
        ? notFoundResponse(request.method, request.path)
        : resolveApplicationProgrammingInterfaceResponse(
            response,
            state.requests()
        );
}

function routeResponse(
    state: DeterministicGitHubApplicationProgrammingInterfaceState,
    request: RecordedIncomingRequest
): DeterministicGitHubApplicationProgrammingInterfaceResponse {
    if (request.method === 'POST' && request.path === '/graphql') {
        return graphqlResponse(state, request);
    }
    return requestResponse(state, request);
}

function recordIncomingRequest(request: IncomingMessage, body: string): RecordedIncomingRequest {
    const address = new URL(request.url ?? '/', 'http://localhost');
    return {
        body,
        method: request.method ?? 'GET',
        path: address.pathname,
        search: address.search
    };
}

function writeUnexpectedError(response: ServerResponse, error: unknown): void {
    writeJavaScriptObjectNotation(response, {
        status: internalServerErrorStatus,
        body: { message: error instanceof Error ? error.message : 'Unexpected server error' }
    });
}

function routeRequest(
    state: DeterministicGitHubApplicationProgrammingInterfaceState,
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
        writeJavaScriptObjectNotation(response, routeResponse(state, recordedRequest));
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

function serverAddress(port: number): string {
    return `http://127.0.0.1:${port}`;
}

export async function createDeterministicGitHubApplicationProgrammingInterfaceServer(
    options: DeterministicGitHubApplicationProgrammingInterfaceServerOptions
): Promise<DeterministicGitHubApplicationProgrammingInterfaceServer> {
    let requests: readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[] = [];
    const server = createServer(function (request, response) {
        routeRequest(
            {
                scenario: options.scenario,
                recordRequest(recordedRequest) {
                    requests = [ ...requests, recordedRequest ];
                },
                requests() {
                    return requests;
                }
            },
            request,
            response
        );
    });

    await listen(server, options.port);

    return {
        baseAddress: serverAddress(options.port),
        graphqlAddress: `${serverAddress(options.port)}/graphql`,
        requests() {
            return requests;
        },
        async stop() {
            await close(server);
        }
    };
}
