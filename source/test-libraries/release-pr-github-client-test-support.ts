import {
    createReleasePullRequestGitHubClient,
    type ReleasePullRequestGitHubClient
} from '../command-line-interface/runner/release-pr-github-client.ts';

export type RecordedRequest = {
    readonly body: string;
    readonly headers: RequestHeaders | undefined;
    readonly method: string;
    readonly path: string;
    readonly search: string;
};
type RequestHeaders = Headers | Readonly<Record<string, string>> | readonly (readonly [string, string])[];
type RecordedRequestResult = {
    readonly method: string;
    readonly request: RecordedRequest;
    readonly url: URL;
};
export type RouteResponse = () => Response;
export type CapturedRequests = {
    readonly record: (request: RecordedRequest) => void;
    readonly records: readonly RecordedRequest[];
};

export function jsonResponse(data: unknown, status = 200): Response {
    return Response.json(data, { status });
}

export function emptyResponse(status = 204): Response {
    return new Response(null, { status });
}

export function createPullRequest(
    number: number,
    overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
    return {
        base: { ref: 'main' },
        head: { ref: 'release/packtory', repo: { full_name: 'owner/repo' }, sha: 'release-head' },
        labels: [ { name: 'release' } ],
        merge_commit_sha: 'merge-sha',
        merged_at: '2026-06-01T00:00:00.000Z',
        number,
        title: 'Prepare release',
        user: { login: 'github-actions[bot]' },
        ...overrides
    };
}

export function createCommit(message = 'Release packages'): Record<string, unknown> {
    return {
        commit: { message },
        parents: [ { sha: 'main-head' } ]
    };
}

export function captureRequests(): CapturedRequests {
    const records: RecordedRequest[] = [];
    return {
        record(request) {
            records.push(request);
        },
        records
    };
}

export function readHeader(headers: RequestHeaders | undefined, name: string): string | undefined {
    if (headers instanceof Headers) {
        return headers.get(name) ?? undefined;
    }
    if (headers === undefined || Array.isArray(headers)) {
        return undefined;
    }
    const value: unknown = Reflect.get(headers, name);
    return typeof value === 'string' ? value : undefined;
}

export function requestHasSearchParameter(record: RecordedRequest, name: string, value: string): boolean {
    const searchParameters = new URLSearchParams(record.search);
    return searchParameters.get(name) === value;
}

export function createClientWithToken(
    fetchImplementation: typeof globalThis.fetch,
    token: string | undefined
): ReleasePullRequestGitHubClient {
    return createReleasePullRequestGitHubClient({
        apiBaseUrl: 'https://api.github.com',
        fetch: fetchImplementation,
        owner: 'owner',
        repo: 'repo',
        token
    });
}

export function createClient(fetchImplementation: typeof globalThis.fetch): ReleasePullRequestGitHubClient {
    return createClientWithToken(fetchImplementation, 'token');
}

export function hasRequestWithBody(
    records: readonly RecordedRequest[],
    method: string,
    path: string,
    bodyPart: string
): boolean {
    return records.some(function (record) {
        return record.method === method && record.path === path && record.body.includes(bodyPart);
    });
}

export function routeKey(method: string, path: string): string {
    return `${method} ${path}`;
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): URL {
    if (typeof input === 'string') {
        return new URL(input);
    }
    if (input instanceof URL) {
        return input;
    }
    return new URL(input.url);
}

function requestBody(init: Readonly<RequestInit> | undefined): string {
    return typeof init?.body === 'string' ? init.body : '';
}

function recordRequest(
    input: Parameters<typeof globalThis.fetch>[0],
    init: Readonly<RequestInit> | undefined
): RecordedRequestResult {
    const url = requestUrl(input);
    const method = init?.method ?? 'GET';
    return {
        method,
        request: { body: requestBody(init), headers: init?.headers, method, path: url.pathname, search: url.search },
        url
    };
}

export function createRouteFetch(routes: ReadonlyMap<string, RouteResponse>): typeof globalThis.fetch {
    return async function (input, init) {
        const { method, url } = recordRequest(input, init);
        const response = routes.get(routeKey(method, url.pathname));
        if (response === undefined) {
            return jsonResponse({ message: `No route for ${method} ${url.pathname}` }, 404);
        }
        return response();
    };
}

export function createRecordedRouteFetch(
    capturedRequests: CapturedRequests,
    routes: ReadonlyMap<string, RouteResponse>
): typeof globalThis.fetch {
    return async function (input, init) {
        const { method, request, url } = recordRequest(input, init);
        capturedRequests.record(request);
        return routes.get(routeKey(method, url.pathname))?.() ??
            jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
    };
}
