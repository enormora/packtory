import type { ReleasePullRequestConfig } from './release-pull-request-config.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';

type GitHubActionsCiConfig = NonNullable<ReleasePullRequestConfig['githubActionsCi']>;
type WorkflowRunLookup = Awaited<ReturnType<ReleasePullRequestGitHubClient['findDispatchedWorkflowRun']>>;
type WorkflowRunResult = Awaited<ReturnType<ReleasePullRequestGitHubClient['readWorkflowRunResult']>>;
type WorkflowSleep = (milliseconds: number) => Promise<void>;

type WorkflowRunLookupFailureInput = {
    readonly branch: string;
    readonly headSha: string;
    readonly observedRunIds: readonly number[];
    readonly workflowFile: string;
};

type FindDispatchedWorkflowRunInput = {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: ReleasePullRequestConfig;
    readonly headSha: string;
};

type WaitForDispatchedWorkflowRunInput = FindDispatchedWorkflowRunInput & {
    readonly sleep: WorkflowSleep;
};

type WorkflowStatusMirrorInput = {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly headSha: string;
    readonly runResult: WorkflowRunResult;
};

type WaitForWorkflowCompletionInput = {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly headSha: string;
    readonly runId: number;
    readonly sleep: WorkflowSleep;
};

type MirrorWorkflowStatusInput = {
    readonly client: ReleasePullRequestGitHubClient;
    readonly context: string;
    readonly headSha: string;
    readonly runResult: WorkflowRunResult;
};

type PendingWorkflowStatusesInput = {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly headSha: string;
};

type FailedWorkflowStatusesInput = PendingWorkflowStatusesInput & {
    readonly description: string;
};

type RunConfiguredGitHubActionsCiInput = {
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: ReleasePullRequestConfig;
    readonly headSha: string;
    readonly sleep: WorkflowSleep;
};

const workflowRunLookupAttempts = 30;
const workflowRunCompletionAttempts = 120;
const workflowPollIntervalMilliseconds = 10_000;

function createRetryAttempts(count: number): readonly number[] {
    return Array.from({ length: count }, function (_value, index) {
        return index;
    });
}

function isLastAttempt(attempt: number, count: number): boolean {
    return attempt === count - 1;
}

function formatObservedRunIds(observedRunIds: readonly number[]): string {
    if (observedRunIds.length === 0) {
        return 'none';
    }
    return observedRunIds.join(', ');
}

function formatWorkflowRunLookupFailure(input: WorkflowRunLookupFailureInput): string {
    return (
        `Release workflow run was not created for ${input.headSha}; ` +
        `workflow=${input.workflowFile}, branch=${input.branch}, event=workflow_dispatch, ` +
        `observedRunIds=${formatObservedRunIds(input.observedRunIds)}`
    );
}

async function findDispatchedWorkflowRun(input: FindDispatchedWorkflowRunInput): Promise<WorkflowRunLookup> {
    return input.client.findDispatchedWorkflowRun({
        branch: input.config.branch,
        headSha: input.headSha,
        workflowFile: input.ciConfig.workflowFile
    });
}

async function waitForDispatchedWorkflowRun(input: WaitForDispatchedWorkflowRunInput): Promise<number> {
    let lookup = await findDispatchedWorkflowRun(input);
    for (const attempt of createRetryAttempts(workflowRunLookupAttempts)) {
        if (attempt !== 0) {
            lookup = await findDispatchedWorkflowRun(input);
        }
        if (lookup.runId !== undefined) {
            return lookup.runId;
        }
        if (!isLastAttempt(attempt, workflowRunLookupAttempts)) {
            await input.sleep(workflowPollIntervalMilliseconds);
        }
    }
    throw new Error(
        formatWorkflowRunLookupFailure({
            branch: input.config.branch,
            headSha: input.headSha,
            observedRunIds: lookup.observedRunIds,
            workflowFile: input.ciConfig.workflowFile
        })
    );
}

function requiredJobResultFor(
    runResult: WorkflowRunResult,
    context: string
): WorkflowRunResult['jobs'][number] | undefined {
    return runResult.jobs.find(function (candidate) {
        return candidate.name === context;
    });
}

function allRequiredJobsCompleted(runResult: WorkflowRunResult, contexts: readonly string[]): boolean {
    return contexts.every(function (context) {
        return requiredJobResultFor(runResult, context)?.conclusion !== undefined;
    });
}

function workflowStatusState(conclusion: string): 'error' | 'failure' | 'success' {
    if (conclusion === 'success') {
        return 'success';
    }
    return conclusion === 'failure' ? 'failure' : 'error';
}

function workflowStatusDescription(conclusion: string): string {
    return `Dispatched release CI job ${conclusion}.`;
}

function workflowStatusTargetUrl(
    runResult: WorkflowRunResult,
    job: WorkflowRunResult['jobs'][number] | undefined
): string | undefined {
    return job?.url ?? runResult.url;
}

async function mirrorKnownWorkflowStatuses(input: WorkflowStatusMirrorInput): Promise<void> {
    await Promise.all(
        input.ciConfig.requiredStatusContexts.map(async function (context) {
            const job = requiredJobResultFor(input.runResult, context);
            if (job === undefined) {
                await input.client.createStatus({
                    commitSha: input.headSha,
                    context,
                    description: 'Dispatched release CI job running.',
                    state: 'pending',
                    targetUrl: input.runResult.url
                });
                return;
            }
            if (job.conclusion === undefined) {
                await input.client.createStatus({
                    commitSha: input.headSha,
                    context,
                    description: 'Dispatched release CI job running.',
                    state: 'pending',
                    targetUrl: workflowStatusTargetUrl(input.runResult, job)
                });
                return;
            }
            await input.client.createStatus({
                commitSha: input.headSha,
                context,
                description: workflowStatusDescription(job.conclusion),
                state: workflowStatusState(job.conclusion),
                targetUrl: workflowStatusTargetUrl(input.runResult, job)
            });
        })
    );
}

async function waitForWorkflowCompletion(input: WaitForWorkflowCompletionInput): Promise<WorkflowRunResult> {
    for (const attempt of createRetryAttempts(workflowRunCompletionAttempts)) {
        const result = await input.client.readWorkflowRunResult(input.runId);
        if (
            result.conclusion !== undefined ||
            allRequiredJobsCompleted(result, input.ciConfig.requiredStatusContexts)
        ) {
            return result;
        }
        await mirrorKnownWorkflowStatuses({ ...input, runResult: result });
        if (!isLastAttempt(attempt, workflowRunCompletionAttempts)) {
            await input.sleep(workflowPollIntervalMilliseconds);
        }
    }
    throw new Error(`Release workflow run ${input.runId} did not complete`);
}

function missingWorkflowStatusDescription(context: string): string {
    return `Missing dispatched release CI job: ${context}.`;
}

type FinalWorkflowStatus = {
    readonly description: string;
    readonly passed: boolean;
    readonly state: 'error' | 'failure' | 'success';
    readonly targetUrl: string | undefined;
};

function incompleteWorkflowStatus(context: string, targetUrl: string | undefined): FinalWorkflowStatus {
    return {
        description: missingWorkflowStatusDescription(context),
        passed: false,
        state: 'failure',
        targetUrl
    };
}

function completedWorkflowStatus(conclusion: string, targetUrl: string | undefined): FinalWorkflowStatus {
    if (conclusion === 'success') {
        return {
            description: 'Dispatched release CI job success.',
            passed: true,
            state: 'success',
            targetUrl
        };
    }
    return {
        description: workflowStatusDescription(conclusion),
        passed: false,
        state: workflowStatusState(conclusion),
        targetUrl
    };
}

function finalWorkflowStatusFor(
    context: string,
    job: WorkflowRunResult['jobs'][number] | undefined,
    runResult: WorkflowRunResult
): FinalWorkflowStatus {
    if (job?.conclusion === undefined) {
        return incompleteWorkflowStatus(context, workflowStatusTargetUrl(runResult, job));
    }
    return completedWorkflowStatus(job.conclusion, workflowStatusTargetUrl(runResult, job));
}

async function mirrorWorkflowStatus(input: MirrorWorkflowStatusInput): Promise<boolean> {
    const job = requiredJobResultFor(input.runResult, input.context);
    const status = finalWorkflowStatusFor(input.context, job, input.runResult);
    await input.client.createStatus({
        commitSha: input.headSha,
        context: input.context,
        description: status.description,
        state: status.state,
        targetUrl: status.targetUrl
    });
    return status.passed;
}

async function mirrorWorkflowStatuses(input: WorkflowStatusMirrorInput): Promise<boolean> {
    const statuses = await Promise.all(
        input.ciConfig.requiredStatusContexts.map(async function (context) {
            return mirrorWorkflowStatus({ ...input, context });
        })
    );
    return statuses.every(Boolean);
}

async function createPendingWorkflowStatuses(input: PendingWorkflowStatusesInput): Promise<void> {
    for (const context of input.ciConfig.requiredStatusContexts) {
        await input.client.createStatus({
            commitSha: input.headSha,
            context,
            description: 'Waiting for dispatched release CI.',
            state: 'pending',
            targetUrl: undefined
        });
    }
}

async function createFailedWorkflowStatuses(input: FailedWorkflowStatusesInput): Promise<void> {
    for (const context of input.ciConfig.requiredStatusContexts) {
        await input.client.createStatus({
            commitSha: input.headSha,
            context,
            description: input.description,
            state: 'error',
            targetUrl: undefined
        });
    }
}

async function dispatchWorkflowRun(input: WaitForDispatchedWorkflowRunInput): Promise<number> {
    await createPendingWorkflowStatuses(input);
    await input.client.dispatchWorkflow({
        ref: input.config.branch,
        workflowFile: input.ciConfig.workflowFile
    });
    return waitForDispatchedWorkflowRun(input);
}

async function resolveWorkflowRunId(input: WaitForDispatchedWorkflowRunInput): Promise<number> {
    const { runId } = await findDispatchedWorkflowRun(input);
    return runId ?? dispatchWorkflowRun(input);
}

async function deleteActionRequiredPullRequestRuns(
    input: RunConfiguredGitHubActionsCiInput,
    ciConfig: GitHubActionsCiConfig
): Promise<void> {
    if (!ciConfig.deleteActionRequiredPullRequestRuns) {
        return;
    }
    await input.client.deleteActionRequiredPullRequestRuns({ branch: input.config.branch, headSha: input.headSha });
}

async function resolveWorkflowRunIdOrFailStatuses(
    input: RunConfiguredGitHubActionsCiInput,
    ciConfig: GitHubActionsCiConfig
): Promise<number> {
    try {
        return await resolveWorkflowRunId({ ...input, ciConfig });
    } catch (error) {
        await createFailedWorkflowStatuses({
            ciConfig,
            client: input.client,
            description: 'Dispatched release CI did not start.',
            headSha: input.headSha
        });
        throw error;
    }
}

async function waitForWorkflowCompletionOrFailStatuses(
    input: RunConfiguredGitHubActionsCiInput,
    ciConfig: GitHubActionsCiConfig,
    runId: number
): Promise<WorkflowRunResult> {
    try {
        return await waitForWorkflowCompletion({
            ciConfig,
            client: input.client,
            headSha: input.headSha,
            runId,
            sleep: input.sleep
        });
    } catch (error) {
        await createFailedWorkflowStatuses({
            ciConfig,
            client: input.client,
            description: 'Dispatched release CI did not complete.',
            headSha: input.headSha
        });
        throw error;
    }
}

export async function runConfiguredGitHubActionsCi(input: RunConfiguredGitHubActionsCiInput): Promise<boolean> {
    const { githubActionsCi } = input.config;
    if (githubActionsCi === undefined) {
        return true;
    }
    await deleteActionRequiredPullRequestRuns(input, githubActionsCi);
    const runId = await resolveWorkflowRunIdOrFailStatuses(input, githubActionsCi);
    return mirrorWorkflowStatuses({
        ciConfig: githubActionsCi,
        client: input.client,
        headSha: input.headSha,
        runResult: await waitForWorkflowCompletionOrFailStatuses(input, githubActionsCi, runId)
    });
}
