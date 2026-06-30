export type RecordedRequest = {
    readonly body: string;
    readonly headers: HeadersInit | undefined;
    readonly method: string;
    readonly path: string;
    readonly search: string;
};

export type RouteHandler = () => Response;

const unhandledRouteStatusCode = 500;

export function jsonResponse(data: unknown, status = 200): Response {
    return Response.json(data, { status });
}

export function emptyResponse(status = 204): Response {
    return new Response(null, { status });
}

export function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): URL {
    if (typeof input === 'string') {
        return new URL(input);
    }
    if (input instanceof URL) {
        return input;
    }
    return new URL(input.url);
}

function requestBody(init: Parameters<typeof globalThis.fetch>[1]): string {
    return typeof init?.body === 'string' ? init.body : '';
}

export function readHeader(headers: HeadersInit | undefined, name: string): string | undefined {
    if (headers instanceof Headers) {
        return headers.get(name) ?? undefined;
    }
    if (headers === undefined || Array.isArray(headers)) {
        return undefined;
    }
    const value: unknown = Reflect.get(headers, name);
    return typeof value === 'string' ? value : undefined;
}

export function recordRequest(
    records: RecordedRequest[],
    input: Parameters<typeof globalThis.fetch>[0],
    init: Parameters<typeof globalThis.fetch>[1]
): { readonly method: string; readonly url: URL } {
    const url = requestUrl(input);
    const method = init?.method ?? 'GET';
    records.push({ body: requestBody(init), headers: init?.headers, method, path: url.pathname, search: url.search });
    return { method, url };
}

export function hasRequestWithBody(
    records: readonly RecordedRequest[],
    method: string,
    path: string,
    bodyPart: string
): boolean {
    return records.some((record) => {
        return record.method === method && record.path === path && record.body.includes(bodyPart);
    });
}

export function routeKey(method: string, path: string): string {
    return `${method} ${path}`;
}

export function createFetchFromRoutes(
    records: RecordedRequest[],
    routes: ReadonlyMap<string, RouteHandler>
): typeof fetch {
    return async (input, init) => {
        const { method, url } = recordRequest(records, input, init);
        const route = routes.get(routeKey(method, url.pathname));
        if (route === undefined) {
            return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, unhandledRouteStatusCode);
        }
        return route();
    };
}
