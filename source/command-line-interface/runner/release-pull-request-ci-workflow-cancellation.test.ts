import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { createReleasePullRequestClient } from '../../test-libraries/runner-test-support.ts';
import { runConfiguredGitHubActionsCi } from './release-pull-request-ci.ts';
import type { ReleasePullRequestConfig } from './release-pull-request-config.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';

type WorkflowRunLookup = ReleasePullRequestGitHubClient['findDispatchedWorkflowRun'];
type FakeWorkflowRunLookup = ReturnType<typeof fake> & WorkflowRunLookup;

type DelayedCancellationRun = {
    readonly cancelActiveDispatchedWorkflowRuns: ReturnType<typeof fake>;
    readonly client: ReleasePullRequestGitHubClient;
    readonly createStatus: ReturnType<typeof fake>;
    readonly dispatchWorkflow: ReturnType<typeof fake>;
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly sleepSpy: ReturnType<typeof fake>;
};

function enablePullRequestRunCleanup(config: ReleasePullRequestConfig): ReleasePullRequestConfig {
    if (config.githubActionsCi === undefined) {
        assert.fail('Expected test config to include GitHub Actions CI');
    }
    return {
        ...config,
        githubActionsCi: {
            deleteActionRequiredPullRequestRuns: true,
            requiredStatusContexts: config.githubActionsCi.requiredStatusContexts,
            workflowFile: config.githubActionsCi.workflowFile
        }
    };
}

function createConfig(): ReleasePullRequestConfig {
    return {
        automationAuthor: 'github-actions[bot]',
        body: 'Body',
        branch: 'release/packtory',
        commitSubject: 'Release packages',
        defaultBranch: 'main',
        githubActionsCi: {
            deleteActionRequiredPullRequestRuns: false,
            requiredStatusContexts: [ 'Node.js' ],
            workflowFile: 'ci.yml'
        },
        label: 'release',
        title: 'Prepare release'
    };
}

function createDispatchedWorkflowRunLookup(dispatchWorkflow: ReturnType<typeof fake>): FakeWorkflowRunLookup {
    return fake(async function () {
        return dispatchWorkflow.callCount === 0
            ? { event: 'workflow_dispatch' as const, observedRunIds: [], runId: undefined }
            : { event: 'workflow_dispatch' as const, observedRunIds: [ 1 ], runId: 1 };
    }) as FakeWorkflowRunLookup;
}

function successfulWorkflowRunResult(runId: number): Awaited<
    ReturnType<ReleasePullRequestGitHubClient['readWorkflowRunResult']>
> {
    return {
        conclusion: 'success',
        databaseId: runId,
        jobs: [ { conclusion: 'success', name: 'Node.js', url: 'https://run/node' } ],
        url: `https://github.com/enormora/packtory/actions/runs/${runId}`
    };
}

function createDelayedCancellationRun(
    activeRunIdsByRead: readonly (readonly number[])[] = [ [ 7 ], [ 7 ], [] ]
): DelayedCancellationRun {
    let cancellationReadIndex = 0;
    const cancelActiveDispatchedWorkflowRuns = fake(async function () {
        const runIds = activeRunIdsByRead[cancellationReadIndex] ?? [];
        cancellationReadIndex += 1;
        return runIds;
    });
    const createStatus = fake.resolves(undefined);
    const dispatchWorkflow = fake.resolves(undefined);
    const sleepSpy = fake();
    async function sleep(milliseconds: number): Promise<void> {
        sleepSpy(milliseconds);
    }
    const findDispatchedWorkflowRun = fake(async function () {
        return dispatchWorkflow.callCount === 0
            ? { event: 'workflow_dispatch' as const, observedRunIds: [ 7 ], runId: 7 }
            : { event: 'workflow_dispatch' as const, observedRunIds: [ 7, 8 ], runId: 8 };
    });
    const client = createReleasePullRequestClient({
        cancelActiveDispatchedWorkflowRuns,
        createStatus,
        dispatchWorkflow,
        findDispatchedWorkflowRun,
        readWorkflowRunResult: fake.resolves(successfulWorkflowRunResult(8))
    });
    return { cancelActiveDispatchedWorkflowRuns, client, createStatus, dispatchWorkflow, sleep, sleepSpy };
}

suite('release-pull-request-ci workflow cancellation', function () {
    test('cancels active dispatched runs for the configured release workflow before dispatch', async function () {
        const cancelActiveDispatchedWorkflowRuns = fake.resolves([]);
        const dispatchWorkflow = fake.resolves(undefined);
        const findDispatchedWorkflowRun = createDispatchedWorkflowRunLookup(dispatchWorkflow);
        const client = createReleasePullRequestClient({
            cancelActiveDispatchedWorkflowRuns,
            dispatchWorkflow,
            findDispatchedWorkflowRun,
            readWorkflowRunResult: fake.resolves(successfulWorkflowRunResult(1))
        });

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client,
                config: createConfig(),
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            true
        );

        assert.deepStrictEqual(cancelActiveDispatchedWorkflowRuns.firstCall.args[0], {
            branch: 'release/packtory',
            workflowFile: 'ci.yml'
        });
        assert.strictEqual(cancelActiveDispatchedWorkflowRuns.calledBefore(findDispatchedWorkflowRun), true);
        assert.strictEqual(cancelActiveDispatchedWorkflowRuns.calledBefore(dispatchWorkflow), true);
    });

    test('waits for active dispatched runs to cancel before dispatch', async function () {
        const { cancelActiveDispatchedWorkflowRuns, client, createStatus, dispatchWorkflow, sleep, sleepSpy } =
            createDelayedCancellationRun();

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client,
                config: createConfig(),
                headSha: 'release-head',
                sleep
            }),
            true
        );

        assert.strictEqual(cancelActiveDispatchedWorkflowRuns.callCount, 3);
        assert.strictEqual(sleepSpy.callCount, 2);
        assert.strictEqual(dispatchWorkflow.calledAfter(cancelActiveDispatchedWorkflowRuns), true);
        assert.strictEqual(createStatus.calledAfter(cancelActiveDispatchedWorkflowRuns), true);
    });

    test('dispatches when active runs clear on the final cancellation check', async function () {
        const activeRunIdsByRead = [
            ...Array.from({ length: 29 }, function () {
                return [ 7 ];
            }),
            []
        ];
        const delayedCancellationRun = createDelayedCancellationRun(activeRunIdsByRead);

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client: delayedCancellationRun.client,
                config: createConfig(),
                headSha: 'release-head',
                sleep: delayedCancellationRun.sleep
            }),
            true
        );

        assert.deepStrictEqual({
            cancellationCalls: delayedCancellationRun.cancelActiveDispatchedWorkflowRuns.callCount,
            dispatchCalls: delayedCancellationRun.dispatchWorkflow.callCount
        }, {
            cancellationCalls: 30,
            dispatchCalls: 1
        });
        assert.deepStrictEqual(delayedCancellationRun.cancelActiveDispatchedWorkflowRuns.lastCall.args[0], {
            branch: 'release/packtory',
            workflowFile: 'ci.yml'
        });
    });

    test('fails release statuses when active dispatched runs do not cancel', async function () {
        const cancelActiveDispatchedWorkflowRuns = fake.resolves([ 7 ]);
        const createStatus = fake.resolves(undefined);
        const dispatchWorkflow = fake.resolves(undefined);
        const sleep = fake.resolves(undefined);
        const client = createReleasePullRequestClient({
            cancelActiveDispatchedWorkflowRuns,
            createStatus,
            dispatchWorkflow
        });

        await assert.rejects(
            runConfiguredGitHubActionsCi({
                client,
                config: createConfig(),
                headSha: 'release-head',
                sleep
            }),
            { message: 'Active release workflow runs did not cancel: 7' }
        );

        assert.strictEqual(cancelActiveDispatchedWorkflowRuns.callCount, 30);
        assert.strictEqual(dispatchWorkflow.callCount, 0);
        assert.deepStrictEqual(createStatus.firstCall.args[0], {
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'Dispatched release CI did not start.',
            state: 'error',
            targetUrl: undefined
        });
    });

    test('waits for delayed action-required pull request runs to clear before dispatch', async function () {
        const deletedRunIdsByRead: readonly (readonly number[])[] = [ [ 10 ], [], [] ];
        let deletionReadIndex = 0;
        const deleteActionRequiredPullRequestRuns = fake(async function () {
            const runIds = deletedRunIdsByRead[deletionReadIndex] ?? [];
            deletionReadIndex += 1;
            return runIds;
        });
        const dispatchWorkflow = fake.resolves(undefined);
        const sleep = fake.resolves(undefined);
        const client = createReleasePullRequestClient({
            deleteActionRequiredPullRequestRuns,
            dispatchWorkflow,
            findDispatchedWorkflowRun: createDispatchedWorkflowRunLookup(dispatchWorkflow),
            readWorkflowRunResult: fake.resolves(successfulWorkflowRunResult(1))
        });

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client,
                config: enablePullRequestRunCleanup(createConfig()),
                headSha: 'release-head',
                sleep
            }),
            true
        );

        assert.strictEqual(deleteActionRequiredPullRequestRuns.callCount, 3);
        assert.strictEqual(sleep.callCount, 2);
        assert.strictEqual(deleteActionRequiredPullRequestRuns.calledBefore(dispatchWorkflow), true);
    });

    test('fails release statuses when action-required pull request runs do not clear', async function () {
        const createStatus = fake.resolves(undefined);
        const dispatchWorkflow = fake.resolves(undefined);
        const sleep = fake.resolves(undefined);
        const client = createReleasePullRequestClient({
            createStatus,
            deleteActionRequiredPullRequestRuns: fake.resolves([ 10 ]),
            dispatchWorkflow
        });

        await assert.rejects(
            runConfiguredGitHubActionsCi({
                client,
                config: enablePullRequestRunCleanup(createConfig()),
                headSha: 'release-head',
                sleep
            }),
            { message: 'Action-required pull request workflow runs did not delete: 10' }
        );

        assert.strictEqual(dispatchWorkflow.callCount, 0);
        assert.strictEqual(sleep.callCount, 29);
        assert.deepStrictEqual(createStatus.firstCall.args[0], {
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'Dispatched release CI did not start.',
            state: 'error',
            targetUrl: undefined
        });
    });
});
