import type { ReleasePullRequestConfiguration } from './release-pull-request-configuration.ts';
import type { ReleasePullRequestGitHubClient } from './release-pull-request-github-client.ts';

type GitHubActionsContinuousIntegrationConfiguration = NonNullable<
    ReleasePullRequestConfiguration['githubActionsContinuousIntegration']
>;
type WorkflowRunLookup = Awaited<ReturnType<ReleasePullRequestGitHubClient['findDispatchedWorkflowRun']>>;
type WorkflowRunResult = Awaited<ReturnType<ReleasePullRequestGitHubClient['readWorkflowRunResult']>>;
type WorkflowSleep = (milliseconds: number) => Promise<void>;

type WorkflowRunLookupFailureInput = {
    readonly branch: string;
    readonly headHash: string;
    readonly observedRunIdentifiers: readonly number[];
    readonly workflowFile: string;
};

type FindDispatchedWorkflowRunInput = {
    readonly continuousIntegrationConfiguration: GitHubActionsContinuousIntegrationConfiguration;
    readonly client: ReleasePullRequestGitHubClient;
    readonly configuration: ReleasePullRequestConfiguration;
    readonly headHash: string;
};

type WaitForDispatchedWorkflowRunInput = FindDispatchedWorkflowRunInput & {
    readonly ignoredRunIdentifiers: ReadonlySet<number>;
    readonly sleep: WorkflowSleep;
};

type WorkflowStatusMirrorInput = {
    readonly continuousIntegrationConfiguration: GitHubActionsContinuousIntegrationConfiguration;
    readonly client: ReleasePullRequestGitHubClient;
    readonly headHash: string;
    readonly runResult: WorkflowRunResult;
};

type WaitForWorkflowCompletionInput = {
    readonly continuousIntegrationConfiguration: GitHubActionsContinuousIntegrationConfiguration;
    readonly client: ReleasePullRequestGitHubClient;
    readonly headHash: string;
    readonly runIdentifier: number;
    readonly sleep: WorkflowSleep;
};

type MirrorWorkflowStatusInput = {
    readonly client: ReleasePullRequestGitHubClient;
    readonly context: string;
    readonly headHash: string;
    readonly runResult: WorkflowRunResult;
};

type PendingWorkflowStatusesInput = {
    readonly continuousIntegrationConfiguration: GitHubActionsContinuousIntegrationConfiguration;
    readonly client: ReleasePullRequestGitHubClient;
    readonly headHash: string;
};

type FailedWorkflowStatusesInput = PendingWorkflowStatusesInput & {
    readonly description: string;
};

type RunConfiguredGitHubActionsContinuousIntegrationInput = {
    readonly client: ReleasePullRequestGitHubClient;
    readonly configuration: ReleasePullRequestConfiguration;
    readonly headHash: string;
    readonly sleep: WorkflowSleep;
};

const workflowRunLookupAttempts = 30;
const workflowRunCompletionAttempts = 120;
const actionRequiredPullRequestRunCleanupAttempts = 30;
const actionRequiredPullRequestRunCleanReads = 2;
const staleWorkflowRunCancellationAttempts = 30;
const workflowPollIntervalMilliseconds = 10_000;

function createRetryAttempts(count: number): readonly number[] {
    return Array.from({ length: count }, function (_value, index) {
        return index;
    });
}

function isLastAttempt(attempt: number, count: number): boolean {
    return attempt === count - 1;
}

function formatObservedRunIdentifiers(observedRunIdentifiers: readonly number[]): string {
    if (observedRunIdentifiers.length === 0) {
        return 'none';
    }
    return observedRunIdentifiers.join(', ');
}

function formatWorkflowRunLookupFailure(input: WorkflowRunLookupFailureInput): string {
    return (
        `Release workflow run was not created for ${input.headHash}; ` +
        `workflow=${input.workflowFile}, branch=${input.branch}, event=workflow_dispatch, ` +
        `observedRunIdentifiers=${formatObservedRunIdentifiers(input.observedRunIdentifiers)}`
    );
}

async function findDispatchedWorkflowRun(input: FindDispatchedWorkflowRunInput): Promise<WorkflowRunLookup> {
    return input.client.findDispatchedWorkflowRun({
        branch: input.configuration.branch,
        headHash: input.headHash,
        workflowFile: input.continuousIntegrationConfiguration.workflowFile
    });
}

async function waitForDispatchedWorkflowRun(input: WaitForDispatchedWorkflowRunInput): Promise<number> {
    let lookup = await findDispatchedWorkflowRun(input);
    for (const attempt of createRetryAttempts(workflowRunLookupAttempts)) {
        if (attempt !== 0) {
            lookup = await findDispatchedWorkflowRun(input);
        }
        if (lookup.runIdentifier !== undefined && !input.ignoredRunIdentifiers.has(lookup.runIdentifier)) {
            return lookup.runIdentifier;
        }
        if (!isLastAttempt(attempt, workflowRunLookupAttempts)) {
            await input.sleep(workflowPollIntervalMilliseconds);
        }
    }
    throw new Error(
        formatWorkflowRunLookupFailure({
            branch: input.configuration.branch,
            headHash: input.headHash,
            observedRunIdentifiers: lookup.observedRunIdentifiers,
            workflowFile: input.continuousIntegrationConfiguration.workflowFile
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

function workflowStatusTargetAddress(
    runResult: WorkflowRunResult,
    job: WorkflowRunResult['jobs'][number] | undefined
): string | undefined {
    return job?.address ?? runResult.address;
}

async function mirrorKnownWorkflowStatuses(input: WorkflowStatusMirrorInput): Promise<void> {
    await Promise.all(
        input.continuousIntegrationConfiguration.requiredStatusContexts.map(async function (context) {
            const job = requiredJobResultFor(input.runResult, context);
            if (job === undefined) {
                await input.client.createStatus({
                    commitHash: input.headHash,
                    context,
                    description: 'Dispatched release CI job running.',
                    state: 'pending',
                    targetAddress: input.runResult.address
                });
                return;
            }
            if (job.conclusion === undefined) {
                await input.client.createStatus({
                    commitHash: input.headHash,
                    context,
                    description: 'Dispatched release CI job running.',
                    state: 'pending',
                    targetAddress: workflowStatusTargetAddress(input.runResult, job)
                });
                return;
            }
            await input.client.createStatus({
                commitHash: input.headHash,
                context,
                description: workflowStatusDescription(job.conclusion),
                state: workflowStatusState(job.conclusion),
                targetAddress: workflowStatusTargetAddress(input.runResult, job)
            });
        })
    );
}

async function waitForWorkflowCompletion(input: WaitForWorkflowCompletionInput): Promise<WorkflowRunResult> {
    for (const attempt of createRetryAttempts(workflowRunCompletionAttempts)) {
        const result = await input.client.readWorkflowRunResult(input.runIdentifier);
        if (
            result.conclusion !== undefined ||
            allRequiredJobsCompleted(result, input.continuousIntegrationConfiguration.requiredStatusContexts)
        ) {
            return result;
        }
        await mirrorKnownWorkflowStatuses({ ...input, runResult: result });
        if (!isLastAttempt(attempt, workflowRunCompletionAttempts)) {
            await input.sleep(workflowPollIntervalMilliseconds);
        }
    }
    throw new Error(`Release workflow run ${input.runIdentifier} did not complete`);
}

function missingWorkflowStatusDescription(context: string): string {
    return `Missing dispatched release CI job: ${context}.`;
}

type FinalWorkflowStatus = {
    readonly description: string;
    readonly passed: boolean;
    readonly state: 'error' | 'failure' | 'success';
    readonly targetAddress: string | undefined;
};

function incompleteWorkflowStatus(context: string, targetAddress: string | undefined): FinalWorkflowStatus {
    return {
        description: missingWorkflowStatusDescription(context),
        passed: false,
        state: 'failure',
        targetAddress
    };
}

function completedWorkflowStatus(conclusion: string, targetAddress: string | undefined): FinalWorkflowStatus {
    if (conclusion === 'success') {
        return {
            description: 'Dispatched release CI job success.',
            passed: true,
            state: 'success',
            targetAddress
        };
    }
    return {
        description: workflowStatusDescription(conclusion),
        passed: false,
        state: workflowStatusState(conclusion),
        targetAddress
    };
}

function finalWorkflowStatusFor(
    context: string,
    job: WorkflowRunResult['jobs'][number] | undefined,
    runResult: WorkflowRunResult
): FinalWorkflowStatus {
    if (job?.conclusion === undefined) {
        return incompleteWorkflowStatus(context, workflowStatusTargetAddress(runResult, job));
    }
    return completedWorkflowStatus(job.conclusion, workflowStatusTargetAddress(runResult, job));
}

async function mirrorWorkflowStatus(input: MirrorWorkflowStatusInput): Promise<boolean> {
    const job = requiredJobResultFor(input.runResult, input.context);
    const status = finalWorkflowStatusFor(input.context, job, input.runResult);
    await input.client.createStatus({
        commitHash: input.headHash,
        context: input.context,
        description: status.description,
        state: status.state,
        targetAddress: status.targetAddress
    });
    return status.passed;
}

async function mirrorWorkflowStatuses(input: WorkflowStatusMirrorInput): Promise<boolean> {
    const statuses = await Promise.all(
        input.continuousIntegrationConfiguration.requiredStatusContexts.map(async function (context) {
            return mirrorWorkflowStatus({ ...input, context });
        })
    );
    return statuses.every(Boolean);
}

async function createPendingWorkflowStatuses(input: PendingWorkflowStatusesInput): Promise<void> {
    for (const context of input.continuousIntegrationConfiguration.requiredStatusContexts) {
        await input.client.createStatus({
            commitHash: input.headHash,
            context,
            description: 'Waiting for dispatched release CI.',
            state: 'pending',
            targetAddress: undefined
        });
    }
}

async function createFailedWorkflowStatuses(input: FailedWorkflowStatusesInput): Promise<void> {
    for (const context of input.continuousIntegrationConfiguration.requiredStatusContexts) {
        await input.client.createStatus({
            commitHash: input.headHash,
            context,
            description: input.description,
            state: 'error',
            targetAddress: undefined
        });
    }
}

async function waitForActiveDispatchedWorkflowRunsToCancel(input: WaitForDispatchedWorkflowRunInput): Promise<void> {
    for (const attempt of createRetryAttempts(staleWorkflowRunCancellationAttempts)) {
        const activeRunIdentifiers = await input.client.cancelActiveDispatchedWorkflowRuns({
            branch: input.configuration.branch,
            workflowFile: input.continuousIntegrationConfiguration.workflowFile
        });
        if (activeRunIdentifiers.length === 0) {
            return;
        }
        if (isLastAttempt(attempt, staleWorkflowRunCancellationAttempts)) {
            throw new Error(
                `Active release workflow runs did not cancel: ${formatObservedRunIdentifiers(activeRunIdentifiers)}`
            );
        }
        await input.sleep(workflowPollIntervalMilliseconds);
    }
}

function nextActionRequiredPullRequestRunCleanReads(
    cleanReads: number,
    deletedRunIdentifiers: readonly number[]
): number {
    return deletedRunIdentifiers.length === 0 ? cleanReads + 1 : 0;
}

async function dispatchWorkflowRun(input: WaitForDispatchedWorkflowRunInput): Promise<number> {
    await waitForActiveDispatchedWorkflowRunsToCancel(input);
    const baseline = await findDispatchedWorkflowRun(input);
    await createPendingWorkflowStatuses(input);
    await input.client.dispatchWorkflow({
        reference: input.configuration.branch,
        workflowFile: input.continuousIntegrationConfiguration.workflowFile
    });
    return waitForDispatchedWorkflowRun({
        ...input,
        ignoredRunIdentifiers: new Set([ ...input.ignoredRunIdentifiers, ...baseline.observedRunIdentifiers ])
    });
}

async function deleteActionRequiredPullRequestRuns(
    input: RunConfiguredGitHubActionsContinuousIntegrationInput
): Promise<readonly number[]> {
    return input.client.deleteActionRequiredPullRequestRuns({
        branch: input.configuration.branch,
        headHash: input.headHash
    });
}

async function waitForActionRequiredPullRequestRunsToDelete(
    input: RunConfiguredGitHubActionsContinuousIntegrationInput
): Promise<void> {
    let cleanReads = 0;
    for (const attempt of createRetryAttempts(actionRequiredPullRequestRunCleanupAttempts)) {
        const deletedRunIdentifiers = await deleteActionRequiredPullRequestRuns(input);
        cleanReads = nextActionRequiredPullRequestRunCleanReads(cleanReads, deletedRunIdentifiers);
        if (cleanReads === actionRequiredPullRequestRunCleanReads) {
            return;
        }
        if (isLastAttempt(attempt, actionRequiredPullRequestRunCleanupAttempts)) {
            throw new Error(
                `Action-required pull request workflow runs did not delete: ${
                    formatObservedRunIdentifiers(deletedRunIdentifiers)
                }`
            );
        }
        await input.sleep(workflowPollIntervalMilliseconds);
    }
}

async function waitForConfiguredActionRequiredPullRequestRunCleanup(
    input: RunConfiguredGitHubActionsContinuousIntegrationInput,
    continuousIntegrationConfiguration: GitHubActionsContinuousIntegrationConfiguration
): Promise<void> {
    if (continuousIntegrationConfiguration.deleteActionRequiredPullRequestRuns) {
        await waitForActionRequiredPullRequestRunsToDelete(input);
    }
}

async function resolveWorkflowRunIdentifierOrFailStatuses(
    input: RunConfiguredGitHubActionsContinuousIntegrationInput,
    continuousIntegrationConfiguration: GitHubActionsContinuousIntegrationConfiguration
): Promise<number> {
    try {
        await waitForConfiguredActionRequiredPullRequestRunCleanup(input, continuousIntegrationConfiguration);
        return await dispatchWorkflowRun({
            ...input,
            continuousIntegrationConfiguration,
            ignoredRunIdentifiers: new Set()
        });
    } catch (error) {
        await createFailedWorkflowStatuses({
            continuousIntegrationConfiguration,
            client: input.client,
            description: 'Dispatched release CI did not start.',
            headHash: input.headHash
        });
        throw error;
    }
}

async function waitForWorkflowCompletionOrFailStatuses(
    input: RunConfiguredGitHubActionsContinuousIntegrationInput,
    continuousIntegrationConfiguration: GitHubActionsContinuousIntegrationConfiguration,
    runIdentifier: number
): Promise<WorkflowRunResult> {
    try {
        return await waitForWorkflowCompletion({
            continuousIntegrationConfiguration,
            client: input.client,
            headHash: input.headHash,
            runIdentifier,
            sleep: input.sleep
        });
    } catch (error) {
        await createFailedWorkflowStatuses({
            continuousIntegrationConfiguration,
            client: input.client,
            description: 'Dispatched release CI did not complete.',
            headHash: input.headHash
        });
        throw error;
    }
}

export async function runConfiguredGitHubActionsContinuousIntegration(
    input: RunConfiguredGitHubActionsContinuousIntegrationInput
): Promise<boolean> {
    const { githubActionsContinuousIntegration } = input.configuration;
    if (githubActionsContinuousIntegration === undefined) {
        return true;
    }
    const runIdentifier = await resolveWorkflowRunIdentifierOrFailStatuses(input, githubActionsContinuousIntegration);
    return mirrorWorkflowStatuses({
        continuousIntegrationConfiguration: githubActionsContinuousIntegration,
        client: input.client,
        headHash: input.headHash,
        runResult: await waitForWorkflowCompletionOrFailStatuses(
            input,
            githubActionsContinuousIntegration,
            runIdentifier
        )
    });
}
