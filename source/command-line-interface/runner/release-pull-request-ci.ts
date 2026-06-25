import type { ReleasePullRequestConfig } from './release-pull-request-config.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';

type GitHubActionsCiConfig = NonNullable<ReleasePullRequestConfig['githubActionsCi']>;

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

async function waitForDispatchedWorkflowRun(input: {
    readonly ciConfig: GitHubActionsCiConfig;
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: ReleasePullRequestConfig;
    readonly headSha: string;
    readonly sleep: (milliseconds: number) => Promise<void>;
}): Promise<number> {
    for (const attempt of createRetryAttempts(workflowRunLookupAttempts)) {
        const runId = await input.client.findDispatchedWorkflowRunId({
            branch: input.config.branch,
            headSha: input.headSha,
            workflowFile: input.ciConfig.workflowFile
        });
        if (runId !== undefined) {
            return runId;
        }
        if (!isLastAttempt(attempt, workflowRunLookupAttempts)) {
            await input.sleep(workflowPollIntervalMilliseconds);
        }
    }
    throw new Error(`Release workflow run was not created for ${input.headSha}`);
}

async function waitForWorkflowCompletion(input: {
    readonly client: ReleasePullRequestGitHubClient;
    readonly runId: number;
    readonly sleep: (milliseconds: number) => Promise<void>;
}): Promise<Awaited<ReturnType<ReleasePullRequestGitHubClient['readWorkflowRunResult']>>> {
    for (const attempt of createRetryAttempts(workflowRunCompletionAttempts)) {
        const result = await input.client.readWorkflowRunResult(input.runId);
        if (result.conclusion !== undefined) {
            return result;
        }
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
    readonly runResult: Awaited<ReturnType<ReleasePullRequestGitHubClient['readWorkflowRunResult']>>;
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
    readonly runResult: Awaited<ReturnType<ReleasePullRequestGitHubClient['readWorkflowRunResult']>>;
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
    await createPendingWorkflowStatuses({ ...input, ciConfig: githubActionsCi });
    await input.client.dispatchWorkflow({ ref: input.config.branch, workflowFile: githubActionsCi.workflowFile });
    const runId = await waitForDispatchedWorkflowRun({ ...input, ciConfig: githubActionsCi });
    const runResult = await waitForWorkflowCompletion({ client: input.client, runId, sleep: input.sleep });
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
