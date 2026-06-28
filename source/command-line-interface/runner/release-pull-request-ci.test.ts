import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { runConfiguredGitHubActionsCi } from './release-pull-request-ci.ts';
import type { ReleasePullRequestConfig } from './release-pull-request-config.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';

type WorkflowRunLookup = Awaited<ReturnType<ReleasePullRequestGitHubClient['findDispatchedWorkflowRun']>>;
type WorkflowRunResult = Awaited<ReturnType<ReleasePullRequestGitHubClient['readWorkflowRunResult']>>;
type WorkflowRunLookupInput = Parameters<ReleasePullRequestGitHubClient['findDispatchedWorkflowRun']>[0];

function workflowRunFound(runId = 1, observedRunIds: readonly number[] = [runId]): WorkflowRunLookup {
    return { event: 'workflow_dispatch', observedRunIds, runId };
}

function workflowRunMissing(observedRunIds: readonly number[] = []): WorkflowRunLookup {
    return { event: 'workflow_dispatch', observedRunIds, runId: undefined };
}

function findWorkflowRunSequence(results: readonly [WorkflowRunLookup, ...WorkflowRunLookup[]]) {
    let index = 0;
    return fake(async (_: WorkflowRunLookupInput) => {
        const result = results[Math.min(index, results.length - 1)];
        index += 1;
        if (result === undefined) {
            throw new Error('Missing workflow run lookup fixture');
        }
        return result;
    });
}

function readWorkflowRunResultSequence(results: readonly [WorkflowRunResult, ...WorkflowRunResult[]]) {
    let index = 0;
    return fake(async (_: number) => {
        const result = results[Math.min(index, results.length - 1)];
        index += 1;
        if (result === undefined) {
            throw new Error('Missing workflow run result fixture');
        }
        return result;
    });
}

function createConfig(requiredStatusContexts: readonly string[] = ['Node.js']): ReleasePullRequestConfig {
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

function createClient(overrides: Partial<ReleasePullRequestGitHubClient> = {}): ReleasePullRequestGitHubClient {
    return {
        closeOpenReleasePullRequests: fake.resolves(undefined),
        createOrUpdateReleasePullRequest: fake.resolves(1),
        createStatus: fake.resolves(undefined),
        deleteActionRequiredPullRequestRuns: fake.resolves(undefined),
        dispatchWorkflow: fake.resolves(undefined),
        findDispatchedWorkflowRun: fake.resolves(workflowRunFound()),
        getBranchHeadSha: fake.resolves('main-head'),
        getPullRequest: fake.resolves(undefined as never),
        getPullRequestHead: fake.resolves(undefined as never),
        listCommitPullRequests: fake.resolves([]),
        readWorkflowRunResult: fake.resolves({
            conclusion: 'success',
            databaseId: 1,
            jobs: [{ conclusion: 'success', name: 'Node.js', url: 'https://run/job' }]
        }),
        ...overrides
    };
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
        const findDispatchedWorkflowRun = findWorkflowRunSequence([workflowRunMissing(), workflowRunFound()]);
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
        assert.deepStrictEqual(findDispatchedWorkflowRun.secondCall.args[0], {
            branch: 'release/packtory',
            headSha: 'release-head',
            workflowFile: 'ci.yml'
        });
        assert.deepStrictEqual(deleteActionRequiredPullRequestRuns.firstCall.args[0], {
            branch: 'release/packtory',
            headSha: 'release-head'
        });
    });

    test('requires all mirrored statuses to pass', async function () {
        const createStatus = fake.resolves(undefined);
        const client = createClient({ createStatus });

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client,
                config: createConfig(['Node.js', 'Missing job']),
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            false
        );

        assert.deepStrictEqual(createStatus.firstCall.args[0], {
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'Dispatched release CI job success.',
            state: 'success',
            targetUrl: 'https://run/job'
        });
        assert.deepStrictEqual(createStatus.secondCall.args[0], {
            commitSha: 'release-head',
            context: 'Missing job',
            description: 'Missing dispatched release CI job: Missing job.',
            state: 'failure',
            targetUrl: undefined
        });
    });

    test('returns false and mirrors a failure when a required job is missing', async function () {
        const createStatus = fake.resolves(undefined);
        const client = createClient({ createStatus });

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client,
                config: createConfig(['Missing job']),
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            false
        );

        assert.deepStrictEqual(createStatus.firstCall.args[0], {
            commitSha: 'release-head',
            context: 'Missing job',
            description: 'Missing dispatched release CI job: Missing job.',
            state: 'failure',
            targetUrl: undefined
        });
    });

    test('returns false and mirrors a failed required job', async function () {
        const createStatus = fake.resolves(undefined);
        const client = createClient({
            createStatus,
            readWorkflowRunResult: fake.resolves({
                conclusion: 'failure',
                databaseId: 1,
                jobs: [{ conclusion: 'failure', name: 'Node.js', url: 'https://run/job' }]
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

        assert.deepStrictEqual(createStatus.firstCall.args[0], {
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
        const createStatus = fake.resolves(undefined);
        const findDispatchedWorkflowRun = fake.resolves(workflowRunMissing([2, 3]));
        const sleep = fake.resolves(undefined);
        await assert.rejects(
            runConfiguredGitHubActionsCi({
                client: createClient({ createStatus, findDispatchedWorkflowRun }),
                config: createConfig(),
                headSha: 'release-head',
                sleep
            }),
            {
                message:
                    'Release workflow run was not created for release-head; workflow=ci.yml, ' +
                    'branch=release/packtory, event=workflow_dispatch, observedRunIds=2, 3'
            }
        );
        assert.strictEqual(findDispatchedWorkflowRun.callCount, 31);
        assert.strictEqual(sleep.callCount, 29);
        assert.deepStrictEqual(createStatus.secondCall.args[0], {
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'Dispatched release CI did not start.',
            state: 'error',
            targetUrl: undefined
        });
    });

    test('reports none when a dispatched workflow lookup observes no runs', async function () {
        await assert.rejects(
            runConfiguredGitHubActionsCi({
                client: createClient({ findDispatchedWorkflowRun: fake.resolves(workflowRunMissing()) }),
                config: createConfig(),
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            {
                message:
                    'Release workflow run was not created for release-head; workflow=ci.yml, ' +
                    'branch=release/packtory, event=workflow_dispatch, observedRunIds=none'
            }
        );
    });

    test('reports run ids from the latest dispatched workflow lookup', async function () {
        await assert.rejects(
            runConfiguredGitHubActionsCi({
                client: createClient({
                    findDispatchedWorkflowRun: findWorkflowRunSequence([
                        workflowRunMissing([1]),
                        workflowRunMissing([2]),
                        workflowRunMissing([3])
                    ])
                }),
                config: createConfig(),
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            {
                message:
                    'Release workflow run was not created for release-head; workflow=ci.yml, ' +
                    'branch=release/packtory, event=workflow_dispatch, observedRunIds=3'
            }
        );
    });

    test('mirrors a running required job with its job URL while waiting', async function () {
        const createStatus = fake.resolves(undefined);
        const readWorkflowRunResult = readWorkflowRunResultSequence([
            {
                conclusion: undefined,
                databaseId: 1,
                jobs: [
                    { conclusion: undefined, name: 'Other job', url: 'https://run/other-job' },
                    { conclusion: undefined, name: 'Node.js', url: 'https://run/job' }
                ]
            },
            {
                conclusion: 'success',
                databaseId: 1,
                jobs: [{ conclusion: 'success', name: 'Node.js', url: 'https://run/job' }]
            }
        ]);

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client: createClient({ createStatus, readWorkflowRunResult }),
                config: createConfig(),
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            true
        );

        assert.deepStrictEqual(createStatus.firstCall.args[0], {
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'Dispatched release CI job running.',
            state: 'pending',
            targetUrl: 'https://run/job'
        });
        assert.deepStrictEqual(createStatus.secondCall.args[0], {
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'Dispatched release CI job success.',
            state: 'success',
            targetUrl: 'https://run/job'
        });
    });

    test('does not mirror a running status for a completed job', async function () {
        const createStatus = fake.resolves(undefined);
        const readWorkflowRunResult = readWorkflowRunResultSequence([
            {
                conclusion: undefined,
                databaseId: 1,
                jobs: [{ conclusion: 'success', name: 'Node.js', url: 'https://run/job' }]
            },
            {
                conclusion: 'success',
                databaseId: 1,
                jobs: [{ conclusion: 'success', name: 'Node.js', url: 'https://run/job' }]
            }
        ]);

        assert.strictEqual(
            await runConfiguredGitHubActionsCi({
                client: createClient({ createStatus, readWorkflowRunResult }),
                config: createConfig(),
                headSha: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            true
        );

        assert.strictEqual(createStatus.callCount, 1);
        assert.deepStrictEqual(createStatus.firstCall.args[0], {
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'Dispatched release CI job success.',
            state: 'success',
            targetUrl: 'https://run/job'
        });
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
