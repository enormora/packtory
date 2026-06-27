import type { ReleasePullRequestConfig } from './release-pull-request-config.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';

type GitHubActionsCiConfig = NonNullable<ReleasePullRequestConfig['githubActionsCi']>;
type WorkflowRunLookup = Awaited<ReturnType<ReleasePullRequestGitHubClient['findDispatchedWorkflowRun']>>;
type WorkflowRunResult = Awaited<ReturnType<ReleasePullRequestGitHubClient['readWorkflowRunResult']>>;

const workflowRunLookupAttempts = 30;
const workflowRunCompletionAttempts = 120;
const workflowPollIntervalMilliseconds = 10_000;

function createRetryAttempts(count: number): readonly number[] {
    return Array.from({ length: count }, (_value, index) => {
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

function formatWorkflowRunLookupFailure(input: {
    readonly branch: string;
    readonly headSha: string;
    readonly observedRunIds: readonly number[];
    readonly workflowFile: string;
}): string {
    return (
        `Release workflow run was not created for ${input.headSha}; ` +
        `workflow=${input.workflowFile}, branch=${input.branch}, event=workflow_dispatch, ` +
        `observedRunIds=${formatObservedRunIds(input.observedRunIds)}`
    );
}

async function findDispatchedWorkflowRun(input: {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: ReleasePullRequestConfig;
    readonly headSha: string;
}): Promise<WorkflowRunLookup> {
    return input.client.findDispatchedWorkflowRun({
        branch: input.config.branch,
        headSha: input.headSha,
        workflowFile: input.ciConfig.workflowFile
    });
}

async function waitForDispatchedWorkflowRun(input: {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: ReleasePullRequestConfig;
    readonly headSha: string;
    readonly sleep: (milliseconds: number) => Promise<void>;
}): Promise<number> {
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

async function mirrorRunningWorkflowStatuses(input: {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly headSha: string;
    readonly runResult: WorkflowRunResult;
}): Promise<void> {
    await Promise.all(
        input.ciConfig.requiredStatusContexts.map(async (context) => {
            const job = input.runResult.jobs.find((candidate) => {
                return candidate.name === context;
            });
            if (job === undefined || job.conclusion !== undefined) {
                return;
            }
            await input.client.createStatus({
                commitSha: input.headSha,
                context,
                description: 'Dispatched release CI job running.',
                state: 'pending',
                targetUrl: job.url
            });
        })
    );
}

async function waitForWorkflowCompletion(input: {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly headSha: string;
    readonly runId: number;
    readonly sleep: (milliseconds: number) => Promise<void>;
}): Promise<WorkflowRunResult> {
    for (const attempt of createRetryAttempts(workflowRunCompletionAttempts)) {
        const result = await input.client.readWorkflowRunResult(input.runId);
        if (result.conclusion !== undefined) {
            return result;
        }
        await mirrorRunningWorkflowStatuses({ ...input, runResult: result });
        if (!isLastAttempt(attempt, workflowRunCompletionAttempts)) {
            await input.sleep(workflowPollIntervalMilliseconds);
        }
    }
    throw new Error(`Release workflow run ${input.runId} did not complete`);
}

function formatWorkflowStatusFailure(context: string, conclusion: string | undefined): string {
    if (conclusion === undefined) {
        return `Missing dispatched release CI job: ${context}.`;
    }
    return `Dispatched release CI job ${conclusion}.`;
}

async function mirrorWorkflowStatus(input: {
    readonly client: ReleasePullRequestGitHubClient;
    readonly context: string;
    readonly headSha: string;
    readonly runResult: WorkflowRunResult;
}): Promise<boolean> {
    const job = input.runResult.jobs.find((candidate) => {
        return candidate.name === input.context;
    });
    if (job?.conclusion === 'success') {
        await input.client.createStatus({
            commitSha: input.headSha,
            context: input.context,
            description: 'Dispatched release CI job success.',
            state: 'success',
            targetUrl: job.url
        });
        return true;
    }
    await input.client.createStatus({
        commitSha: input.headSha,
        context: input.context,
        description: formatWorkflowStatusFailure(input.context, job?.conclusion),
        state: 'failure',
        targetUrl: job?.url
    });
    return false;
}

async function mirrorWorkflowStatuses(input: {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly headSha: string;
    readonly runResult: WorkflowRunResult;
}): Promise<boolean> {
    const statuses = await Promise.all(
        input.ciConfig.requiredStatusContexts.map(async (context) => {
            return mirrorWorkflowStatus({ ...input, context });
        })
    );
    return statuses.every(Boolean);
}

async function createPendingWorkflowStatuses(input: {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly headSha: string;
}): Promise<void> {
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

async function createFailedWorkflowStatuses(input: {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly description: string;
    readonly headSha: string;
}): Promise<void> {
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

async function dispatchWorkflowRun(input: {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: ReleasePullRequestConfig;
    readonly headSha: string;
    readonly sleep: (milliseconds: number) => Promise<void>;
}): Promise<number> {
    await createPendingWorkflowStatuses(input);
    try {
        await input.client.dispatchWorkflow({
            ref: input.config.branch,
            workflowFile: input.ciConfig.workflowFile
        });
        const runId = await waitForDispatchedWorkflowRun(input);
        return runId;
    } catch (error) {
        await createFailedWorkflowStatuses({
            ...input,
            description: 'Dispatched release CI did not start.'
        });
        throw error;
    }
}

async function resolveWorkflowRunId(input: {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: ReleasePullRequestConfig;
    readonly headSha: string;
    readonly sleep: (milliseconds: number) => Promise<void>;
}): Promise<number> {
    const { runId } = await findDispatchedWorkflowRun(input);
    return runId ?? dispatchWorkflowRun(input);
}

export async function runConfiguredGitHubActionsCi(input: {
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: ReleasePullRequestConfig;
    readonly headSha: string;
    readonly sleep: (milliseconds: number) => Promise<void>;
}): Promise<boolean> {
    const { githubActionsCi } = input.config;
    if (githubActionsCi === undefined) {
        return true;
    }
    const runId = await resolveWorkflowRunId({ ...input, ciConfig: githubActionsCi });
    const runResult = await waitForWorkflowCompletion({
        ciConfig: githubActionsCi,
        client: input.client,
        headSha: input.headSha,
        runId,
        sleep: input.sleep
    });
    if (githubActionsCi.deleteActionRequiredPullRequestRuns) {
        await input.client.deleteActionRequiredPullRequestRuns({ branch: input.config.branch, headSha: input.headSha });
    }
    return mirrorWorkflowStatuses({
        ciConfig: githubActionsCi,
        client: input.client,
        headSha: input.headSha,
        runResult
    });
}
