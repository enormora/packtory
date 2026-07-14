import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { createReleasePullRequestClient } from '../../test-libraries/runner-test-support.ts';
import { runConfiguredGitHubActionsCi } from './release-pull-request-ci.ts';
import type { ReleasePullRequestConfig } from './release-pull-request-config.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';

type WorkflowRunLookup = ReleasePullRequestGitHubClient['findDispatchedWorkflowRun'];
type FakeWorkflowRunLookup = ReturnType<typeof fake> & WorkflowRunLookup;
type WorkflowRunResult = Awaited<ReturnType<ReleasePullRequestGitHubClient['readWorkflowRunResult']>>;
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
function createFreshWorkflowRunLookup(dispatchWorkflow: ReturnType<typeof fake>): FakeWorkflowRunLookup {
    let staleLookupsAfterDispatch = 0;
    return fake(async function (): ReturnType<WorkflowRunLookup> {
        if (dispatchWorkflow.callCount === 0) {
            return { event: 'workflow_dispatch' as const, observedRunIds: [ 7 ], runId: 7 };
        }
        staleLookupsAfterDispatch += 1;
        return staleLookupsAfterDispatch === 1
            ? { event: 'workflow_dispatch' as const, observedRunIds: [ 7 ], runId: 7 }
            : { event: 'workflow_dispatch' as const, observedRunIds: [ 7, 8 ], runId: 8 };
    }) as FakeWorkflowRunLookup;
}

function workflowRunResultForJob(conclusion: string, jobUrl = 'https://run/job'): WorkflowRunResult {
    return {
        conclusion,
        databaseId: 1,
        url: 'https://github.com/enormora/packtory/actions/runs/1',
        jobs: [ { conclusion, name: 'Node.js', url: jobUrl } ]
    };
}

function createClient(overrides: Partial<ReleasePullRequestGitHubClient> = {}): ReleasePullRequestGitHubClient {
    return createReleasePullRequestClient({
        findDispatchedWorkflowRun: createDispatchedWorkflowRunLookup(),
        readWorkflowRunResult: fake.resolves(workflowRunResultForJob('success')),
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
    assert.strictEqual(deleteActionRequiredPullRequestRuns.calledBefore(findDispatchedWorkflowRun), true);
}

async function assertUnsuccessfulJobIsMirrored(conclusion: string, expectedState: 'error' | 'failure'): Promise<void> {
    const createStatus = fake.resolves(undefined);
    const client = createClient({
        createStatus,
        readWorkflowRunResult: fake.resolves(workflowRunResultForJob(conclusion))
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
        description: `Dispatched release CI job ${conclusion}.`,
        state: expectedState,
        targetUrl: 'https://run/job'
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

    suite('successful workflow mirroring', function () {
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

        test('ignores existing dispatched workflow runs and waits for a fresh run', async function () {
            const createStatus = fake.resolves(undefined);
            const dispatchWorkflow = fake.resolves(undefined);
            const readWorkflowRunResult = fake.resolves(workflowRunResultForJob('success'));
            const client = createClient({
                createStatus,
                dispatchWorkflow,
                findDispatchedWorkflowRun: createFreshWorkflowRunLookup(dispatchWorkflow),
                readWorkflowRunResult
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

            assert.strictEqual(readWorkflowRunResult.firstCall.args[0], 8);
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
        });

        test('mirrors a successful job from an incomplete workflow run as success', async function () {
            const createStatus = fake.resolves(undefined);
            const readWorkflowRunResult = fake.resolves({
                conclusion: undefined,
                databaseId: 1,
                url: 'https://github.com/enormora/packtory/actions/runs/1',
                jobs: [ { conclusion: 'success', name: 'Node.js', url: 'https://run/node' } ]
            });
            const client = createClient({ createStatus, readWorkflowRunResult });

            assert.strictEqual(
                await runConfiguredGitHubActionsCi({
                    client,
                    config: createConfig(),
                    headSha: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                true
            );

            assert.deepStrictEqual(createStatus.secondCall.args[0], {
                commitSha: 'release-head',
                context: 'Node.js',
                description: 'Dispatched release CI job success.',
                state: 'success',
                targetUrl: 'https://run/node'
            });
        });
    });

    suite('failed workflow mirroring', function () {
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
            await assertUnsuccessfulJobIsMirrored('failure', 'failure');
        });

        test('mirrors non-failure unsuccessful conclusions as error statuses', async function () {
            await assertUnsuccessfulJobIsMirrored('cancelled', 'error');
        });

        test('mirrors known workflow statuses while waiting for completion', async function () {
            const createStatus = fake.resolves(undefined);
            const runResults = [
                {
                    conclusion: 'success',
                    databaseId: 1,
                    url: 'https://github.com/enormora/packtory/actions/runs/1',
                    jobs: [
                        { conclusion: 'success', name: 'Missing job', url: 'https://run/missing' },
                        { conclusion: 'success', name: 'Successful job', url: 'https://run/success' },
                        { conclusion: 'success', name: 'Pending job', url: 'https://run/pending' },
                        { conclusion: 'success', name: 'Failed job', url: 'https://run/failed' }
                    ]
                },
                {
                    conclusion: undefined,
                    databaseId: 1,
                    url: 'https://github.com/enormora/packtory/actions/runs/1',
                    jobs: [
                        { conclusion: 'success', name: 'Successful job', url: 'https://run/success' },
                        { conclusion: undefined, name: 'Pending job', url: 'https://run/pending' },
                        { conclusion: 'failure', name: 'Failed job', url: 'https://run/failed' }
                    ]
                }
            ];
            const readWorkflowRunResult = fake(async function () {
                const result = runResults.pop();
                if (result === undefined) {
                    throw new Error('Unexpected workflow run result read');
                }
                return result;
            });
            const client = createClient({ createStatus, readWorkflowRunResult });

            assert.strictEqual(
                await runConfiguredGitHubActionsCi({
                    client,
                    config: createConfig([ 'Missing job', 'Successful job', 'Pending job', 'Failed job' ]),
                    headSha: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                true
            );

            assert.deepStrictEqual(createStatus.getCall(4).args[0], {
                commitSha: 'release-head',
                context: 'Missing job',
                description: 'Dispatched release CI job running.',
                state: 'pending',
                targetUrl: 'https://github.com/enormora/packtory/actions/runs/1'
            });
            assert.deepStrictEqual(createStatus.getCall(5).args[0], {
                commitSha: 'release-head',
                context: 'Successful job',
                description: 'Dispatched release CI job success.',
                state: 'success',
                targetUrl: 'https://run/success'
            });
            assert.deepStrictEqual(createStatus.getCall(6).args[0], {
                commitSha: 'release-head',
                context: 'Pending job',
                description: 'Dispatched release CI job running.',
                state: 'pending',
                targetUrl: 'https://run/pending'
            });
            assert.deepStrictEqual(createStatus.getCall(7).args[0], {
                commitSha: 'release-head',
                context: 'Failed job',
                description: 'Dispatched release CI job failure.',
                state: 'failure',
                targetUrl: 'https://run/failed'
            });
        });

        test('treats runs as complete when every required job has a conclusion', async function () {
            const createStatus = fake.resolves(undefined);
            const readWorkflowRunResult = fake.resolves({
                conclusion: undefined,
                databaseId: 1,
                url: 'https://github.com/enormora/packtory/actions/runs/1',
                jobs: [
                    { conclusion: 'success', name: 'Node.js', url: 'https://run/node' },
                    { conclusion: 'success', name: 'Types', url: 'https://run/types' }
                ]
            });
            const client = createClient({ createStatus, readWorkflowRunResult });

            assert.strictEqual(
                await runConfiguredGitHubActionsCi({
                    client,
                    config: createConfig([ 'Node.js', 'Types' ]),
                    headSha: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                true
            );

            assert.strictEqual(readWorkflowRunResult.callCount, 1);
            assert.deepStrictEqual(createStatus.getCall(2).args[0], {
                commitSha: 'release-head',
                context: 'Node.js',
                description: 'Dispatched release CI job success.',
                state: 'success',
                targetUrl: 'https://run/node'
            });
            assert.deepStrictEqual(createStatus.getCall(3).args[0], {
                commitSha: 'release-head',
                context: 'Types',
                description: 'Dispatched release CI job success.',
                state: 'success',
                targetUrl: 'https://run/types'
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

        test('reports observed workflow run IDs when dispatch lookup never finds the run', async function () {
            const findDispatchedWorkflowRun = fake.resolves({
                event: 'workflow_dispatch',
                observedRunIds: [ 4, 9 ],
                runId: undefined
            });
            await assert.rejects(
                runConfiguredGitHubActionsCi({
                    client: createClient({ findDispatchedWorkflowRun }),
                    config: createConfig(),
                    headSha: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                {
                    message:
                        'Release workflow run was not created for release-head; workflow=ci.yml, branch=release/packtory, event=workflow_dispatch, observedRunIds=4, 9'
                }
            );
        });

        test('marks release CI statuses as error when dispatch fails', async function () {
            const createStatus = fake.resolves(undefined);
            const dispatchWorkflow = fake.rejects(new Error('dispatch failed'));
            await assert.rejects(
                runConfiguredGitHubActionsCi({
                    client: createClient({ createStatus, dispatchWorkflow }),
                    config: createConfig(),
                    headSha: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                { message: 'dispatch failed' }
            );

            assert.deepStrictEqual(createStatus.secondCall.args[0], {
                commitSha: 'release-head',
                context: 'Node.js',
                description: 'Dispatched release CI did not start.',
                state: 'error',
                targetUrl: undefined
            });
        });

        test('fails when the dispatched workflow run does not complete', async function () {
            const createStatus = fake.resolves(undefined);
            const deleteActionRequiredPullRequestRuns = fake.resolves(undefined);
            const readWorkflowRunResult = fake.resolves({ conclusion: undefined, databaseId: 1, jobs: [] });
            const sleep = fake.resolves(undefined);
            await assert.rejects(
                runConfiguredGitHubActionsCi({
                    client: createClient({ createStatus, deleteActionRequiredPullRequestRuns, readWorkflowRunResult }),
                    config: createConfig(),
                    headSha: 'release-head',
                    sleep
                }),
                { message: 'Release workflow run 1 did not complete' }
            );
            assert.strictEqual(readWorkflowRunResult.callCount, 120);
            assert.strictEqual(sleep.callCount, 119);
            assert.deepStrictEqual(deleteActionRequiredPullRequestRuns.firstCall.args[0], {
                branch: 'release/packtory',
                headSha: 'release-head'
            });
            assert.deepStrictEqual(createStatus.lastCall.args[0], {
                commitSha: 'release-head',
                context: 'Node.js',
                description: 'Dispatched release CI did not complete.',
                state: 'error',
                targetUrl: undefined
            });
        });
    });
});
