import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { runConfiguredGitHubActionsCi } from './release-pull-request-ci.ts';
import type { ReleasePullRequestConfig } from './release-pull-request-config.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';
import { createReleasePullRequestClient } from './runner-test-support.ts';

type WorkflowRunLookup = ReleasePullRequestGitHubClient['findDispatchedWorkflowRun'];
type FakeWorkflowRunLookup = ReturnType<typeof fake> & WorkflowRunLookup;

function createConfig(requiredStatusContexts: readonly string[] = [ 'Node.js' ]): ReleasePullRequestConfig {
    return {
        automationAuthor: 'github-actions[bot]',
        body: 'Body',
        branch: 'release/packtory',
        commitSubject: 'Release packages',
        defaultBranch: 'main',
        githubActionsCi: {
            deleteActionRequiredPullRequestRuns: true,
            requiredStatusContexts,
            workflowFile: 'ci.yml'
        },
        label: 'release',
        title: 'Prepare release'
    };
}

function createDispatchedWorkflowRunLookup(): FakeWorkflowRunLookup {
    let callCount = 0;
    return fake(async function (): ReturnType<WorkflowRunLookup> {
        callCount += 1;
        return callCount === 1
            ? { event: 'workflow_dispatch' as const, observedRunIds: [], runId: undefined }
            : { event: 'workflow_dispatch' as const, observedRunIds: [ 1 ], runId: 1 };
    }) as FakeWorkflowRunLookup;
}

function createClient(overrides: Partial<ReleasePullRequestGitHubClient> = {}): ReleasePullRequestGitHubClient {
    return createReleasePullRequestClient({
        findDispatchedWorkflowRun: createDispatchedWorkflowRunLookup(),
        readWorkflowRunResult: fake.resolves({
            conclusion: 'success',
            databaseId: 1,
            url: 'https://github.com/enormora/packtory/actions/runs/1',
            jobs: [ { conclusion: 'success', name: 'Node.js', url: 'https://run/job' } ]
        }),
        ...overrides
    });
}

function assertSuccessfulWorkflowMirrored(
    createStatus: ReturnType<typeof fake>,
    dispatchWorkflow: ReturnType<typeof fake>,
    findDispatchedWorkflowRun: ReturnType<typeof fake>,
    deleteActionRequiredPullRequestRuns: ReturnType<typeof fake>
): void {
    assert.deepStrictEqual(createStatus.firstCall.args[0], {
        commitSha: 'release-head',
        context: 'Node.js',
        description: 'Waiting for dispatched release CI.',
        state: 'pending',
        targetUrl: undefined
    });
    assert.deepStrictEqual(createStatus.secondCall.args[0], {
        commitSha: 'release-head',
        context: 'Node.js',
        description: 'Dispatched release CI job success.',
        state: 'success',
        targetUrl: 'https://run/job'
    });
    assert.deepStrictEqual(dispatchWorkflow.firstCall.args[0], {
        ref: 'release/packtory',
        workflowFile: 'ci.yml'
    });
    assert.deepStrictEqual(findDispatchedWorkflowRun.firstCall.args[0], {
        branch: 'release/packtory',
        headSha: 'release-head',
        workflowFile: 'ci.yml'
    });
    assert.deepStrictEqual(deleteActionRequiredPullRequestRuns.firstCall.args[0], {
        branch: 'release/packtory',
        headSha: 'release-head'
    });
}

suite('release-pull-request-ci', function () {
    test('returns true without dispatch when GitHub Actions CI is not configured', async function () {
        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client: createClient(),
                config: { ...createConfig(), githubActionsCi: undefined },
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            true
        );
    });

    test('dispatches the configured workflow and mirrors successful statuses', async function () {
        const createStatus = fake.resolves(undefined);
        const deleteActionRequiredPullRequestRuns = fake.resolves(undefined);
        const dispatchWorkflow = fake.resolves(undefined);
        const findDispatchedWorkflowRun = createDispatchedWorkflowRunLookup();
        const client = createClient({
            createStatus,
            deleteActionRequiredPullRequestRuns,
            dispatchWorkflow,
            findDispatchedWorkflowRun
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

        assertSuccessfulWorkflowMirrored(
            createStatus,
            dispatchWorkflow,
            findDispatchedWorkflowRun,
            deleteActionRequiredPullRequestRuns
        );
    });

    test('requires all mirrored statuses to pass', async function () {
        const createStatus = fake.resolves(undefined);
        const client = createClient({ createStatus });

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client,
                config: createConfig([ 'Node.js', 'Missing job' ]),
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            false
        );

        assert.deepStrictEqual(createStatus.thirdCall.args[0], {
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'Dispatched release CI job success.',
            state: 'success',
            targetUrl: 'https://run/job'
        });
        assert.deepStrictEqual(createStatus.getCall(3).args[0], {
            commitSha: 'release-head',
            context: 'Missing job',
            description: 'Missing dispatched release CI job: Missing job.',
            state: 'failure',
            targetUrl: 'https://github.com/enormora/packtory/actions/runs/1'
        });
    });

    test('returns false and mirrors a failure when a required job is missing', async function () {
        const createStatus = fake.resolves(undefined);
        const client = createClient({ createStatus });

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client,
                config: createConfig([ 'Missing job' ]),
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            false
        );

        assert.deepStrictEqual(createStatus.secondCall.args[0], {
            commitSha: 'release-head',
            context: 'Missing job',
            description: 'Missing dispatched release CI job: Missing job.',
            state: 'failure',
            targetUrl: 'https://github.com/enormora/packtory/actions/runs/1'
        });
    });

    test('returns false and mirrors a failed required job', async function () {
        const createStatus = fake.resolves(undefined);
        const client = createClient({
            createStatus,
            readWorkflowRunResult: fake.resolves({
                conclusion: 'failure',
                databaseId: 1,
                url: 'https://github.com/enormora/packtory/actions/runs/1',
                jobs: [ { conclusion: 'failure', name: 'Node.js', url: 'https://run/job' } ]
            })
        });

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client,
                config: createConfig(),
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            false
        );

        assert.deepStrictEqual(createStatus.secondCall.args[0], {
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'Dispatched release CI job failure.',
            state: 'failure',
            targetUrl: 'https://run/job'
        });
    });

    test('does not delete blocked pull request runs when cleanup is disabled', async function () {
        const deleteActionRequiredPullRequestRuns = fake.resolves(undefined);
        const client = createClient({ deleteActionRequiredPullRequestRuns });
        const config = createConfig();
        if (config.githubActionsCi === undefined) {
            assert.fail('Expected test config to include GitHub Actions CI');
        }

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client,
                config: {
                    ...config,
                    githubActionsCi: {
                        deleteActionRequiredPullRequestRuns: false,
                        requiredStatusContexts: config.githubActionsCi.requiredStatusContexts,
                        workflowFile: config.githubActionsCi.workflowFile
                    }
                },
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            true
        );
        assert.strictEqual(deleteActionRequiredPullRequestRuns.callCount, 0);
    });

    test('fails when the dispatched workflow run is not created', async function () {
        const findDispatchedWorkflowRun = fake.resolves({
            event: 'workflow_dispatch',
            observedRunIds: [],
            runId: undefined
        });
        const sleep = fake.resolves(undefined);
        await assert.rejects(
            runConfiguredGitHubActionsCi({
                client: createClient({ findDispatchedWorkflowRun }),
                config: createConfig(),
                headSha: 'release-head',
                sleep
            }),
            {
                message:
                    'Release workflow run was not created for release-head; workflow=ci.yml, branch=release/packtory, event=workflow_dispatch, observedRunIds=none'
            }
        );
        assert.strictEqual(findDispatchedWorkflowRun.callCount, 31);
        assert.strictEqual(sleep.callCount, 29);
    });

    test('fails when the dispatched workflow run does not complete', async function () {
        const readWorkflowRunResult = fake.resolves({ conclusion: undefined, databaseId: 1, jobs: [] });
        const sleep = fake.resolves(undefined);
        await assert.rejects(
            runConfiguredGitHubActionsCi({
                client: createClient({ readWorkflowRunResult }),
                config: createConfig(),
                headSha: 'release-head',
                sleep
            }),
            { message: 'Release workflow run 1 did not complete' }
        );
        assert.strictEqual(readWorkflowRunResult.callCount, 120);
        assert.strictEqual(sleep.callCount, 119);
    });
});
