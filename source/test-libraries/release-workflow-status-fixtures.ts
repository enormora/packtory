import assert from 'node:assert';
import { fake } from 'sinon';
import type { ReleasePullRequestConfiguration } from '../command-line-interface/runner/release-pull-request-configuration.ts';
import { runConfiguredGitHubActionsContinuousIntegration } from '../command-line-interface/runner/release-pull-request-continuous-integration.ts';
import type { ReleasePullRequestGitHubClient } from '../command-line-interface/runner/release-pull-request-github-client.ts';
import { createReleasePullRequestClient } from './runner-test-support.ts';

type WorkflowRunLookup = ReleasePullRequestGitHubClient['findDispatchedWorkflowRun'];

export type FakeWorkflowRunLookup = ReturnType<typeof fake> & WorkflowRunLookup;

export type WorkflowRunResult = Awaited<ReturnType<ReleasePullRequestGitHubClient['readWorkflowRunResult']>>;

export function createConfiguration(
    requiredStatusContexts: readonly string[] = [ 'Node.js' ]
): ReleasePullRequestConfiguration {
    return {
        automationAuthor: 'github-actions[bot]',
        body: 'Body',
        branch: 'release/packtory',
        commitSubject: 'Release packages',
        defaultBranch: 'main',
        githubActionsContinuousIntegration: {
            deleteActionRequiredPullRequestRuns: true,
            requiredStatusContexts,
            workflowFile: 'continuous-integration.yml'
        },
        label: 'release',
        title: 'Prepare release'
    };
}

export function createDispatchedWorkflowRunLookup(): FakeWorkflowRunLookup {
    let callCount = 0;
    return fake(async function (): ReturnType<WorkflowRunLookup> {
        callCount += 1;
        return callCount === 1
            ? { event: 'workflow_dispatch' as const, observedRunIdentifiers: [], runIdentifier: undefined }
            : { event: 'workflow_dispatch' as const, observedRunIdentifiers: [ 1 ], runIdentifier: 1 };
    }) as FakeWorkflowRunLookup;
}

export function createFreshWorkflowRunLookup(dispatchWorkflow: ReturnType<typeof fake>): FakeWorkflowRunLookup {
    let staleLookupsAfterDispatch = 0;
    return fake(async function (): ReturnType<WorkflowRunLookup> {
        if (dispatchWorkflow.callCount === 0) {
            return { event: 'workflow_dispatch' as const, observedRunIdentifiers: [ 7 ], runIdentifier: 7 };
        }
        staleLookupsAfterDispatch += 1;
        return staleLookupsAfterDispatch === 1
            ? { event: 'workflow_dispatch' as const, observedRunIdentifiers: [ 7 ], runIdentifier: 7 }
            : { event: 'workflow_dispatch' as const, observedRunIdentifiers: [ 7, 8 ], runIdentifier: 8 };
    }) as FakeWorkflowRunLookup;
}

export function workflowRunResultForJob(conclusion: string, jobAddress = 'https://run/job'): WorkflowRunResult {
    return {
        conclusion,
        databaseIdentifier: 1,
        address: 'https://github.com/enormora/packtory/actions/runs/1',
        jobs: [ { conclusion, name: 'Node.js', address: jobAddress } ]
    };
}

export function createClient(overrides: Partial<ReleasePullRequestGitHubClient> = {}): ReleasePullRequestGitHubClient {
    return createReleasePullRequestClient({
        findDispatchedWorkflowRun: createDispatchedWorkflowRunLookup(),
        readWorkflowRunResult: fake.resolves(workflowRunResultForJob('success')),
        ...overrides
    });
}

export function assertSuccessfulWorkflowMirrored(
    createStatus: ReturnType<typeof fake>,
    dispatchWorkflow: ReturnType<typeof fake>,
    findDispatchedWorkflowRun: ReturnType<typeof fake>,
    deleteActionRequiredPullRequestRuns: ReturnType<typeof fake>
): void {
    assert.deepStrictEqual(createStatus.firstCall.args[0], {
        commitHash: 'release-head',
        context: 'Node.js',
        description: 'Waiting for dispatched release CI.',
        state: 'pending',
        targetAddress: undefined
    });
    assert.deepStrictEqual(createStatus.secondCall.args[0], {
        commitHash: 'release-head',
        context: 'Node.js',
        description: 'Dispatched release CI job success.',
        state: 'success',
        targetAddress: 'https://run/job'
    });
    assert.deepStrictEqual(dispatchWorkflow.firstCall.args[0], {
        reference: 'release/packtory',
        workflowFile: 'continuous-integration.yml'
    });
    assert.deepStrictEqual(findDispatchedWorkflowRun.firstCall.args[0], {
        branch: 'release/packtory',
        headHash: 'release-head',
        workflowFile: 'continuous-integration.yml'
    });
    assert.deepStrictEqual(deleteActionRequiredPullRequestRuns.firstCall.args[0], {
        branch: 'release/packtory',
        headHash: 'release-head'
    });
    assert.strictEqual(deleteActionRequiredPullRequestRuns.calledBefore(findDispatchedWorkflowRun), true);
}

export async function assertUnsuccessfulJobIsMirrored(
    conclusion: string,
    expectedState: 'error' | 'failure'
): Promise<void> {
    const createStatus = fake.resolves(undefined);
    const client = createClient({
        createStatus,
        readWorkflowRunResult: fake.resolves(workflowRunResultForJob(conclusion))
    });

    assert.strictEqual(
        await runConfiguredGitHubActionsContinuousIntegration({
            client,
            configuration: createConfiguration(),
            headHash: 'release-head',
            sleep: fake.resolves(undefined)
        }),
        false
    );

    assert.deepStrictEqual(createStatus.secondCall.args[0], {
        commitHash: 'release-head',
        context: 'Node.js',
        description: `Dispatched release CI job ${conclusion}.`,
        state: expectedState,
        targetAddress: 'https://run/job'
    });
}
