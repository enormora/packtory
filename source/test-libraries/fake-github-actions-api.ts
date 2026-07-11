type RequestHeaders = Headers | Readonly<Record<string, string>> | readonly (readonly [string, string])[];

export type FakeGitHubRequest = {
    readonly body: string;
    readonly headers: RequestHeaders | undefined;
    readonly method: string;
    readonly path: string;
    readonly search: string;
};

export type FakeGitHubWorkflow = {
    readonly id: number;
    readonly name: string;
    readonly path: string;
};

export type FakeGitHubWorkflowJob = {
    readonly conclusion: string | undefined;
    readonly name: string;
    readonly status: string;
    readonly url: string | undefined;
};

export type FakeGitHubWorkflowRun = {
    readonly conclusion: string | undefined;
    readonly event: string;
    readonly headSha: string;
    readonly id: number;
    readonly jobs: readonly FakeGitHubWorkflowJob[];
    readonly status: string;
    readonly url: string;
    readonly workflowId: number;
};

export type FakeGitHubCommitStatus = {
    readonly context: string;
    readonly description: string;
    readonly sha: string;
    readonly state: string;
    readonly targetUrl: string | undefined;
};

export type FakeGitHubActionsApi = {
    readonly addRun: (run: FakeGitHubWorkflowRun) => void;
    readonly addWorkflow: (workflow: FakeGitHubWorkflow) => void;
    readonly commitStatuses: readonly FakeGitHubCommitStatus[];
    readonly deletedRunIds: readonly number[];
    readonly dispatchedWorkflowIds: readonly number[];
    readonly fetch: typeof globalThis.fetch;
    readonly requests: readonly FakeGitHubRequest[];
    readonly runs: readonly FakeGitHubWorkflowRun[];
    readonly workflows: readonly FakeGitHubWorkflow[];
};

type FakeGitHubActionsApiState = {
    readonly addCommitStatus: (status: FakeGitHubCommitStatus) => void;
    readonly addDeletedRunId: (runId: number) => void;
    readonly addDispatchedWorkflowId: (workflowId: number) => void;
    readonly addRequest: (request: FakeGitHubRequest) => void;
    readonly addRun: (run: FakeGitHubWorkflowRun) => void;
    readonly addWorkflow: (workflow: FakeGitHubWorkflow) => void;
    readonly readCommitStatuses: () => readonly FakeGitHubCommitStatus[];
    readonly readDeletedRunIds: () => readonly number[];
    readonly readDispatchedWorkflowIds: () => readonly number[];
    readonly readRequests: () => readonly FakeGitHubRequest[];
    readonly readRuns: () => readonly FakeGitHubWorkflowRun[];
    readonly readWorkflows: () => readonly FakeGitHubWorkflow[];
};

function createFakeGitHubActionsApiState(): FakeGitHubActionsApiState {
    let commitStatuses: readonly FakeGitHubCommitStatus[] = [];
    let deletedRunIds: readonly number[] = [];
    let dispatchedWorkflowIds: readonly number[] = [];
    let requests: readonly FakeGitHubRequest[] = [];
    let runs: readonly FakeGitHubWorkflowRun[] = [];
    let workflows: readonly FakeGitHubWorkflow[] = [];

    return {
        addCommitStatus(status) {
            commitStatuses = [ ...commitStatuses, status ];
        },
        addDeletedRunId(runId) {
            deletedRunIds = [ ...deletedRunIds, runId ];
        },
        addDispatchedWorkflowId(workflowId) {
            dispatchedWorkflowIds = [ ...dispatchedWorkflowIds, workflowId ];
        },
        addRequest(request) {
            requests = [ ...requests, request ];
        },
        addRun(run) {
            runs = [ ...runs, run ];
        },
        addWorkflow(workflow) {
            workflows = [ ...workflows, workflow ];
        },
        readCommitStatuses() {
            return commitStatuses;
        },
        readDeletedRunIds() {
            return deletedRunIds;
        },
        readDispatchedWorkflowIds() {
            return dispatchedWorkflowIds;
        },
        readRequests() {
            return requests;
        },
        readRuns() {
            return runs;
        },
        readWorkflows() {
            return workflows;
        }
    };
}

type RouteInput = {
    readonly body: string;
    readonly method: string;
    readonly path: string;
    readonly searchParameters: URLSearchParams;
    readonly state: FakeGitHubActionsApiState;
};
type RouteHandler = (input: RouteInput) => Response | undefined;

function jsonResponse(data: unknown, status = 200): Response {
    return Response.json(data, { status });
}

function emptyResponse(status = 204): Response {
    return new Response(null, { status });
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

function requestMethod(init: Readonly<RequestInit> | undefined): string {
    return init?.method ?? 'GET';
}

function recordRequest(
    state: FakeGitHubActionsApiState,
    input: Parameters<typeof globalThis.fetch>[0],
    init: Readonly<RequestInit> | undefined
): RouteInput {
    const url = requestUrl(input);
    const method = requestMethod(init);
    const body = requestBody(init);
    state.addRequest({
        body,
        headers: init?.headers,
        method,
        path: url.pathname,
        search: url.search
    });
    return { body, method, path: url.pathname, searchParameters: url.searchParams, state };
}

function workflowResponse(workflow: FakeGitHubWorkflow): Record<string, unknown> {
    return {
        id: workflow.id,
        name: workflow.name,
        path: workflow.path
    };
}

function runResponse(run: FakeGitHubWorkflowRun): Record<string, unknown> {
    return {
        conclusion: run.conclusion ?? null,
        database_id: run.id,
        event: run.event,
        head_sha: run.headSha,
        html_url: run.url,
        id: run.id,
        status: run.status,
        workflow_id: run.workflowId
    };
}

function jobResponse(job: FakeGitHubWorkflowJob): Record<string, unknown> {
    return {
        conclusion: job.conclusion ?? null,
        html_url: job.url ?? null,
        name: job.name,
        status: job.status
    };
}

function commitStatusResponse(status: FakeGitHubCommitStatus): Record<string, unknown> {
    return {
        context: status.context,
        description: status.description,
        sha: status.sha,
        state: status.state,
        target_url: status.targetUrl ?? null
    };
}

function routeWorkflows(input: RouteInput): Response | undefined {
    if (input.method !== 'GET' || !/\/repos\/[^/]+\/[^/]+\/actions\/workflows$/u.test(input.path)) {
        return undefined;
    }
    return jsonResponse({ workflows: input.state.readWorkflows().map(workflowResponse) });
}

function routeWorkflowRuns(input: RouteInput): Response | undefined {
    const match = /^\/repos\/[^/]+\/[^/]+\/actions\/workflows\/(?<workflowId>\d+)\/runs$/u.exec(input.path);
    if (input.method !== 'GET' || match?.groups?.workflowId === undefined) {
        return undefined;
    }
    const workflowId = Number.parseInt(match.groups.workflowId, 10);
    const event = input.searchParameters.get('event');
    return jsonResponse({
        workflow_runs: input
            .state
            .readRuns()
            .filter(function (run) {
                return run.workflowId === workflowId && (event === null || run.event === event);
            })
            .map(runResponse)
    });
}

function routeRepositoryRuns(input: RouteInput): Response | undefined {
    if (input.method !== 'GET' || !/\/repos\/[^/]+\/[^/]+\/actions\/runs$/u.test(input.path)) {
        return undefined;
    }
    const event = input.searchParameters.get('event');
    return jsonResponse({
        workflow_runs: input
            .state
            .readRuns()
            .filter(function (run) {
                return event === null || run.event === event;
            })
            .map(runResponse)
    });
}

function routeDispatch(input: RouteInput): Response | undefined {
    const match = /^\/repos\/[^/]+\/[^/]+\/actions\/workflows\/(?<workflowId>\d+)\/dispatches$/u.exec(input.path);
    if (input.method !== 'POST' || match?.groups?.workflowId === undefined) {
        return undefined;
    }
    input.state.addDispatchedWorkflowId(Number.parseInt(match.groups.workflowId, 10));
    return emptyResponse();
}

function findRun(input: RouteInput, runId: number): FakeGitHubWorkflowRun | undefined {
    return input.state.readRuns().find(function (candidate) {
        return candidate.id === runId;
    });
}

function runIdFrom(path: string): number | undefined {
    const match = /^\/repos\/[^/]+\/[^/]+\/actions\/runs\/(?<runId>\d+)$/u.exec(path);
    return match?.groups?.runId === undefined ? undefined : Number.parseInt(match.groups.runId, 10);
}

function routeDeleteRun(input: RouteInput): Response | undefined {
    const runId = runIdFrom(input.path);
    if (input.method !== 'DELETE' || runId === undefined) {
        return undefined;
    }
    input.state.addDeletedRunId(runId);
    return emptyResponse();
}

function routeRun(input: RouteInput): Response | undefined {
    const runId = runIdFrom(input.path);
    if (input.method !== 'GET' || runId === undefined) {
        return undefined;
    }
    const run = findRun(input, runId);
    return run === undefined ? jsonResponse({ message: 'run not found' }, 404) : jsonResponse(runResponse(run));
}

function routeRunJobs(input: RouteInput): Response | undefined {
    const match = /^\/repos\/[^/]+\/[^/]+\/actions\/runs\/(?<runId>\d+)\/jobs$/u.exec(input.path);
    if (input.method !== 'GET' || match?.groups?.runId === undefined) {
        return undefined;
    }
    const runId = Number.parseInt(match.groups.runId, 10);
    const run = input.state.readRuns().find(function (candidate) {
        return candidate.id === runId;
    });
    if (run === undefined) {
        return jsonResponse({ message: 'run not found' }, 404);
    }
    return jsonResponse({
        jobs: run.jobs.map(jobResponse),
        total_count: run.jobs.length
    });
}

function routeCreateStatus(input: RouteInput): Response | undefined {
    const match = /^\/repos\/[^/]+\/[^/]+\/statuses\/(?<sha>[^/]+)$/u.exec(input.path);
    if (input.method !== 'POST' || match?.groups?.sha === undefined) {
        return undefined;
    }
    const body = JSON.parse(input.body) as Readonly<Record<string, unknown>>;
    const status: FakeGitHubCommitStatus = {
        context: String(body.context),
        description: String(body.description),
        sha: match.groups.sha,
        state: String(body.state),
        targetUrl: typeof body.target_url === 'string' ? body.target_url : undefined
    };
    input.state.addCommitStatus(status);
    return jsonResponse(commitStatusResponse(status), 201);
}

function routeListStatuses(input: RouteInput): Response | undefined {
    const match = /^\/repos\/[^/]+\/[^/]+\/commits\/(?<sha>[^/]+)\/statuses$/u.exec(input.path);
    if (input.method !== 'GET' || match?.groups?.sha === undefined) {
        return undefined;
    }
    return jsonResponse(
        input
            .state
            .readCommitStatuses()
            .filter(function (status) {
                return status.sha === match.groups?.sha;
            })
            .map(commitStatusResponse)
    );
}

const routeHandlers: readonly RouteHandler[] = [
    routeWorkflows,
    routeWorkflowRuns,
    routeRepositoryRuns,
    routeDispatch,
    routeDeleteRun,
    routeRun,
    routeRunJobs,
    routeCreateStatus,
    routeListStatuses
];

function route(input: RouteInput): Response {
    for (const handler of routeHandlers) {
        const response = handler(input);
        if (response !== undefined) {
            return response;
        }
    }
    return jsonResponse({ message: `Unhandled ${input.method} ${input.path}` }, 500);
}

export function createFakeGitHubActionsApi(): FakeGitHubActionsApi {
    const state = createFakeGitHubActionsApiState();

    return {
        addRun(run) {
            state.addRun(run);
        },
        addWorkflow(workflow) {
            state.addWorkflow(workflow);
        },
        get commitStatuses() {
            return state.readCommitStatuses();
        },
        get deletedRunIds() {
            return state.readDeletedRunIds();
        },
        get dispatchedWorkflowIds() {
            return state.readDispatchedWorkflowIds();
        },
        async fetch(input, init) {
            return route(recordRequest(state, input, init));
        },
        get requests() {
            return state.readRequests();
        },
        get runs() {
            return state.readRuns();
        },
        get workflows() {
            return state.readWorkflows();
        }
    };
}
