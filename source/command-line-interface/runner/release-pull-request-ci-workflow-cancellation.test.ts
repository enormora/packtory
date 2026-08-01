import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { createReleasePullRequestClient } from '../../test-libraries/runner-test-support.ts';
import { runConfiguredGitHubActionsCi } from './release-pull-request-ci.ts';
import type { ReleasePullRequestConfig } from './release-pull-request-config.ts';

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

suite('release-pull-request-ci workflow cancellation', function () {
    test('cancels active dispatched runs for the configured release workflow before dispatch', async function () {
        const cancelActiveDispatchedWorkflowRuns = fake.resolves(undefined);
        const dispatchWorkflow = fake.resolves(undefined);
        const findDispatchedWorkflowRun = fake(async function () {
            return dispatchWorkflow.callCount === 0
                ? { event: 'workflow_dispatch' as const, observedRunIds: [], runId: undefined }
                : { event: 'workflow_dispatch' as const, observedRunIds: [ 1 ], runId: 1 };
        });
        const client = createReleasePullRequestClient({
            cancelActiveDispatchedWorkflowRuns,
            dispatchWorkflow,
            findDispatchedWorkflowRun,
            readWorkflowRunResult: fake.resolves({
                conclusion: 'success',
                databaseId: 1,
                jobs: [ { conclusion: 'success', name: 'Node.js', url: 'https://run/node' } ],
                url: 'https://github.com/enormora/packtory/actions/runs/1'
            })
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
});
