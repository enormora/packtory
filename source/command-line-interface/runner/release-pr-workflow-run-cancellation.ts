import { isDefined } from 'remeda';
import { resolveGitHubResponse } from './github-api-request.ts';
import { readWorkflowRunId, type ReleaseWorkflow, type ReleaseWorkflowRun } from './release-pr-workflow-runs.ts';

type RawWorkflowRun = ReleaseWorkflowRun & {
    readonly conclusion: string | null;
    readonly status: string | null;
};
type WorkflowRunsResponse = {
    readonly data: {
        readonly workflow_runs: readonly RawWorkflowRun[];
    };
};
type RequestContext = {
    readonly headers: Readonly<Record<string, string>>;
    readonly owner: string;
    readonly repo: string;
};
type WorkflowRunLookupInput = RequestContext & {
    readonly branch: string;
    readonly event: 'workflow_dispatch';
    readonly per_page: typeof workflowRunsPageSize;
    readonly workflow_id: number;
};
type PullRequestRunLookupInput = RequestContext & {
    readonly branch: string;
    readonly event: 'pull_request';
    readonly per_page: typeof workflowRunsPageSize;
};
type RunMutationInput = RequestContext & {
    readonly run_id: number;
};
type ListWorkflowRuns = (input: WorkflowRunLookupInput) => Promise<WorkflowRunsResponse>;
type ListWorkflowRunsForRepo = (input: PullRequestRunLookupInput) => Promise<WorkflowRunsResponse>;
type CancelWorkflowRun = (input: RunMutationInput) => Promise<unknown>;
type DeleteWorkflowRun = (input: RunMutationInput) => Promise<unknown>;

type CancelActiveDispatchedWorkflowRunsInput = {
    readonly branch: string;
    readonly cancelWorkflowRun: CancelWorkflowRun;
    readonly listWorkflowRuns: ListWorkflowRuns;
    readonly requestContext: RequestContext;
    readonly workflow: ReleaseWorkflow;
};
type DeleteActionRequiredPullRequestRunsInput = {
    readonly branch: string;
    readonly deleteWorkflowRun: DeleteWorkflowRun;
    readonly headSha: string;
    readonly listWorkflowRunsForRepo: ListWorkflowRunsForRepo;
    readonly requestContext: RequestContext;
};

const workflowRunsPageSize = 100;
const approvalWaitingWorkflowRunStatuses: ReadonlySet<string | null> = new Set([ 'pending', 'requested', 'waiting' ]);
const activeWorkflowRunStatuses: ReadonlySet<string | null> = new Set([
    'in_progress',
    'pending',
    'queued',
    'requested',
    'waiting'
]);

function dispatchedWorkflowRunIsActive(run: RawWorkflowRun): boolean {
    return run.event === 'workflow_dispatch' && activeWorkflowRunStatuses.has(run.status);
}

function releasePullRequestRunNeedsApproval(run: RawWorkflowRun, headSha: string): boolean {
    return (
        run.event === 'pull_request' &&
        run.head_sha === headSha &&
        (
            run.conclusion === 'action_required' ||
            approvalWaitingWorkflowRunStatuses.has(run.status)
        )
    );
}

export async function cancelActiveDispatchedWorkflowRuns(
    input: CancelActiveDispatchedWorkflowRunsInput
): Promise<void> {
    const response = await resolveGitHubResponse(
        input.listWorkflowRuns({
            ...input.requestContext,
            branch: input.branch,
            event: 'workflow_dispatch',
            per_page: workflowRunsPageSize,
            workflow_id: input.workflow.id
        })
    );
    const activeRunIds = response
        .data
        .workflow_runs
        .filter(dispatchedWorkflowRunIsActive)
        .map(readWorkflowRunId)
        .filter(isDefined);
    for (const runId of activeRunIds) {
        await resolveGitHubResponse(
            input.cancelWorkflowRun({
                ...input.requestContext,
                run_id: runId
            })
        );
    }
}

export async function deleteActionRequiredPullRequestRuns(
    input: DeleteActionRequiredPullRequestRunsInput
): Promise<void> {
    const response = await resolveGitHubResponse(
        input.listWorkflowRunsForRepo({
            ...input.requestContext,
            branch: input.branch,
            event: 'pull_request',
            per_page: workflowRunsPageSize
        })
    );
    const blockedRunIds = response
        .data
        .workflow_runs
        .filter(function (run) {
            return releasePullRequestRunNeedsApproval(run, input.headSha);
        })
        .map(readWorkflowRunId)
        .filter(isDefined);
    for (const runId of blockedRunIds) {
        await resolveGitHubResponse(
            input.deleteWorkflowRun({
                ...input.requestContext,
                run_id: runId
            })
        );
    }
}
