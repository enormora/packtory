import { isDefined } from 'remeda';
import { resolveGitHubResponse } from './github-application-programming-interface-request.ts';
import {
    readWorkflowRunIdentifier,
    type ReleaseWorkflow,
    type ReleaseWorkflowRun
} from './release-pull-request-workflow-runs.ts';

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
    readonly repository: string;
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
type ListWorkflowRunsForRepository = (input: PullRequestRunLookupInput) => Promise<WorkflowRunsResponse>;
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
    readonly headHash: string;
    readonly listWorkflowRunsForRepository: ListWorkflowRunsForRepository;
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

function releasePullRequestRunNeedsApproval(run: RawWorkflowRun, headHash: string): boolean {
    return (
        run.event === 'pull_request' &&
        run.head_sha === headHash &&
        (
            run.conclusion === 'action_required' ||
            approvalWaitingWorkflowRunStatuses.has(run.status)
        )
    );
}

export async function cancelActiveDispatchedWorkflowRuns(
    input: CancelActiveDispatchedWorkflowRunsInput
): Promise<readonly number[]> {
    const response = await resolveGitHubResponse(
        input.listWorkflowRuns({
            ...input.requestContext,
            branch: input.branch,
            event: 'workflow_dispatch',
            per_page: workflowRunsPageSize,
            workflow_id: input.workflow.identifier
        })
    );
    const activeRunIdentifiers = response
        .data
        .workflow_runs
        .filter(dispatchedWorkflowRunIsActive)
        .map(readWorkflowRunIdentifier)
        .filter(isDefined);
    for (const runIdentifier of activeRunIdentifiers) {
        await resolveGitHubResponse(
            input.cancelWorkflowRun({
                ...input.requestContext,
                run_id: runIdentifier
            })
        );
    }
    return activeRunIdentifiers;
}

export async function deleteActionRequiredPullRequestRuns(
    input: DeleteActionRequiredPullRequestRunsInput
): Promise<readonly number[]> {
    const response = await resolveGitHubResponse(
        input.listWorkflowRunsForRepository({
            ...input.requestContext,
            branch: input.branch,
            event: 'pull_request',
            per_page: workflowRunsPageSize
        })
    );
    const blockedRunIdentifiers = response
        .data
        .workflow_runs
        .filter(function (run) {
            return releasePullRequestRunNeedsApproval(run, input.headHash);
        })
        .map(readWorkflowRunIdentifier)
        .filter(isDefined);
    for (const runIdentifier of blockedRunIdentifiers) {
        await resolveGitHubResponse(
            input.deleteWorkflowRun({
                ...input.requestContext,
                run_id: runIdentifier
            })
        );
    }
    return blockedRunIdentifiers;
}
