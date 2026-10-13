import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import {
    assertSuccessfulWorkflowMirrored,
    assertUnsuccessfulJobIsMirrored,
    createClient,
    createConfiguration,
    createDispatchedWorkflowRunLookup,
    createFreshWorkflowRunLookup,
    workflowRunResultForJob
} from '../../test-libraries/release-workflow-status-fixtures.ts';
import { runConfiguredGitHubActionsContinuousIntegration } from './release-pull-request-continuous-integration.ts';

suite('release-pull-request-ci', function () {
    test('returns true without dispatch when GitHub Actions CI is not configured', async function () {
        assert.strictEqual(
            await runConfiguredGitHubActionsContinuousIntegration({
                client: createClient(),
                configuration: { ...createConfiguration(), githubActionsContinuousIntegration: undefined },
                headHash: 'release-head',
                sleep: fake.resolves(undefined)
            }),
            true
        );
    });

    suite('successful workflow mirroring', function () {
        test('dispatches the configured workflow and mirrors successful statuses', async function () {
            const createStatus = fake.resolves(undefined);
            const deleteActionRequiredPullRequestRuns = fake.resolves([]);
            const dispatchWorkflow = fake.resolves(undefined);
            const findDispatchedWorkflowRun = createDispatchedWorkflowRunLookup();
            const client = createClient({
                createStatus,
                deleteActionRequiredPullRequestRuns,
                dispatchWorkflow,
                findDispatchedWorkflowRun
            });

            assert.strictEqual(
                await runConfiguredGitHubActionsContinuousIntegration({
                    client,
                    configuration: createConfiguration(),
                    headHash: 'release-head',
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
                await runConfiguredGitHubActionsContinuousIntegration({
                    client,
                    configuration: createConfiguration([ 'Node.js', 'Missing job' ]),
                    headHash: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                false
            );

            assert.deepStrictEqual(createStatus.thirdCall.args[0], {
                commitHash: 'release-head',
                context: 'Node.js',
                description: 'Dispatched release CI job success.',
                state: 'success',
                targetAddress: 'https://run/job'
            });
            assert.deepStrictEqual(createStatus.getCall(3).args[0], {
                commitHash: 'release-head',
                context: 'Missing job',
                description: 'Missing dispatched release CI job: Missing job.',
                state: 'failure',
                targetAddress: 'https://github.com/enormora/packtory/actions/runs/1'
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
                await runConfiguredGitHubActionsContinuousIntegration({
                    client,
                    configuration: createConfiguration(),
                    headHash: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                true
            );

            assert.strictEqual(readWorkflowRunResult.firstCall.args[0], 8);
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
        });

        test('mirrors a successful job from an incomplete workflow run as success', async function () {
            const createStatus = fake.resolves(undefined);
            const readWorkflowRunResult = fake.resolves({
                conclusion: undefined,
                databaseIdentifier: 1,
                address: 'https://github.com/enormora/packtory/actions/runs/1',
                jobs: [ { conclusion: 'success', name: 'Node.js', address: 'https://run/node' } ]
            });
            const client = createClient({ createStatus, readWorkflowRunResult });

            assert.strictEqual(
                await runConfiguredGitHubActionsContinuousIntegration({
                    client,
                    configuration: createConfiguration(),
                    headHash: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                true
            );

            assert.deepStrictEqual(createStatus.secondCall.args[0], {
                commitHash: 'release-head',
                context: 'Node.js',
                description: 'Dispatched release CI job success.',
                state: 'success',
                targetAddress: 'https://run/node'
            });
        });
    });

    suite('failed workflow mirroring', function () {
        test('returns false and mirrors a failure when a required job is missing', async function () {
            const createStatus = fake.resolves(undefined);
            const client = createClient({ createStatus });

            assert.strictEqual(
                await runConfiguredGitHubActionsContinuousIntegration({
                    client,
                    configuration: createConfiguration([ 'Missing job' ]),
                    headHash: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                false
            );

            assert.deepStrictEqual(createStatus.secondCall.args[0], {
                commitHash: 'release-head',
                context: 'Missing job',
                description: 'Missing dispatched release CI job: Missing job.',
                state: 'failure',
                targetAddress: 'https://github.com/enormora/packtory/actions/runs/1'
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
                    databaseIdentifier: 1,
                    address: 'https://github.com/enormora/packtory/actions/runs/1',
                    jobs: [
                        { conclusion: 'success', name: 'Missing job', address: 'https://run/missing' },
                        { conclusion: 'success', name: 'Successful job', address: 'https://run/success' },
                        { conclusion: 'success', name: 'Pending job', address: 'https://run/pending' },
                        { conclusion: 'success', name: 'Failed job', address: 'https://run/failed' }
                    ]
                },
                {
                    conclusion: undefined,
                    databaseIdentifier: 1,
                    address: 'https://github.com/enormora/packtory/actions/runs/1',
                    jobs: [
                        { conclusion: 'success', name: 'Successful job', address: 'https://run/success' },
                        { conclusion: undefined, name: 'Pending job', address: 'https://run/pending' },
                        { conclusion: 'failure', name: 'Failed job', address: 'https://run/failed' }
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
                await runConfiguredGitHubActionsContinuousIntegration({
                    client,
                    configuration: createConfiguration([
                        'Missing job',
                        'Successful job',
                        'Pending job',
                        'Failed job'
                    ]),
                    headHash: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                true
            );

            assert.deepStrictEqual(createStatus.getCall(4).args[0], {
                commitHash: 'release-head',
                context: 'Missing job',
                description: 'Dispatched release CI job running.',
                state: 'pending',
                targetAddress: 'https://github.com/enormora/packtory/actions/runs/1'
            });
            assert.deepStrictEqual(createStatus.getCall(5).args[0], {
                commitHash: 'release-head',
                context: 'Successful job',
                description: 'Dispatched release CI job success.',
                state: 'success',
                targetAddress: 'https://run/success'
            });
            assert.deepStrictEqual(createStatus.getCall(6).args[0], {
                commitHash: 'release-head',
                context: 'Pending job',
                description: 'Dispatched release CI job running.',
                state: 'pending',
                targetAddress: 'https://run/pending'
            });
            assert.deepStrictEqual(createStatus.getCall(7).args[0], {
                commitHash: 'release-head',
                context: 'Failed job',
                description: 'Dispatched release CI job failure.',
                state: 'failure',
                targetAddress: 'https://run/failed'
            });
        });

        test('treats runs as complete when every required job has a conclusion', async function () {
            const createStatus = fake.resolves(undefined);
            const readWorkflowRunResult = fake.resolves({
                conclusion: undefined,
                databaseIdentifier: 1,
                address: 'https://github.com/enormora/packtory/actions/runs/1',
                jobs: [
                    { conclusion: 'success', name: 'Node.js', address: 'https://run/node' },
                    { conclusion: 'success', name: 'Types', address: 'https://run/types' }
                ]
            });
            const client = createClient({ createStatus, readWorkflowRunResult });

            assert.strictEqual(
                await runConfiguredGitHubActionsContinuousIntegration({
                    client,
                    configuration: createConfiguration([ 'Node.js', 'Types' ]),
                    headHash: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                true
            );

            assert.strictEqual(readWorkflowRunResult.callCount, 1);
            assert.deepStrictEqual(createStatus.getCall(2).args[0], {
                commitHash: 'release-head',
                context: 'Node.js',
                description: 'Dispatched release CI job success.',
                state: 'success',
                targetAddress: 'https://run/node'
            });
            assert.deepStrictEqual(createStatus.getCall(3).args[0], {
                commitHash: 'release-head',
                context: 'Types',
                description: 'Dispatched release CI job success.',
                state: 'success',
                targetAddress: 'https://run/types'
            });
        });

        test('does not delete blocked pull request runs when cleanup is disabled', async function () {
            const deleteActionRequiredPullRequestRuns = fake.resolves(undefined);
            const client = createClient({ deleteActionRequiredPullRequestRuns });
            const configuration = createConfiguration();
            if (configuration.githubActionsContinuousIntegration === undefined) {
                assert.fail('Expected test config to include GitHub Actions CI');
            }

            assert.strictEqual(
                await runConfiguredGitHubActionsContinuousIntegration({
                    client,
                    configuration: {
                        ...configuration,
                        githubActionsContinuousIntegration: {
                            deleteActionRequiredPullRequestRuns: false,
                            requiredStatusContexts: configuration
                                .githubActionsContinuousIntegration
                                .requiredStatusContexts,
                            workflowFile: configuration.githubActionsContinuousIntegration.workflowFile
                        }
                    },
                    headHash: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                true
            );
            assert.strictEqual(deleteActionRequiredPullRequestRuns.callCount, 0);
        });

        test('fails when the dispatched workflow run is not created', async function () {
            const findDispatchedWorkflowRun = fake.resolves({
                event: 'workflow_dispatch',
                observedRunIdentifiers: [],
                runIdentifier: undefined
            });
            const sleep = fake.resolves(undefined);
            await assert.rejects(
                runConfiguredGitHubActionsContinuousIntegration({
                    client: createClient({ findDispatchedWorkflowRun }),
                    configuration: createConfiguration(),
                    headHash: 'release-head',
                    sleep
                }),
                {
                    message:
                        'Release workflow run was not created for release-head; workflow=continuous-integration.yml, branch=release/packtory, event=workflow_dispatch, observedRunIdentifiers=none'
                }
            );
            assert.strictEqual(findDispatchedWorkflowRun.callCount, 31);
            assert.strictEqual(sleep.callCount, 30);
        });

        test('reports observed workflow run IDs when dispatch lookup never finds the run', async function () {
            const findDispatchedWorkflowRun = fake.resolves({
                event: 'workflow_dispatch',
                observedRunIdentifiers: [ 4, 9 ],
                runIdentifier: undefined
            });
            await assert.rejects(
                runConfiguredGitHubActionsContinuousIntegration({
                    client: createClient({ findDispatchedWorkflowRun }),
                    configuration: createConfiguration(),
                    headHash: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                {
                    message:
                        'Release workflow run was not created for release-head; workflow=continuous-integration.yml, branch=release/packtory, event=workflow_dispatch, observedRunIdentifiers=4, 9'
                }
            );
        });

        test('marks release CI statuses as error when dispatch fails', async function () {
            const createStatus = fake.resolves(undefined);
            const dispatchWorkflow = fake.rejects(new Error('dispatch failed'));
            await assert.rejects(
                runConfiguredGitHubActionsContinuousIntegration({
                    client: createClient({ createStatus, dispatchWorkflow }),
                    configuration: createConfiguration(),
                    headHash: 'release-head',
                    sleep: fake.resolves(undefined)
                }),
                { message: 'dispatch failed' }
            );

            assert.deepStrictEqual(createStatus.secondCall.args[0], {
                commitHash: 'release-head',
                context: 'Node.js',
                description: 'Dispatched release CI did not start.',
                state: 'error',
                targetAddress: undefined
            });
        });

        test('fails when the dispatched workflow run does not complete', async function () {
            const createStatus = fake.resolves(undefined);
            const deleteActionRequiredPullRequestRuns = fake.resolves([]);
            const readWorkflowRunResult = fake.resolves({ conclusion: undefined, databaseIdentifier: 1, jobs: [] });
            const sleep = fake.resolves(undefined);
            await assert.rejects(
                runConfiguredGitHubActionsContinuousIntegration({
                    client: createClient({ createStatus, deleteActionRequiredPullRequestRuns, readWorkflowRunResult }),
                    configuration: createConfiguration(),
                    headHash: 'release-head',
                    sleep
                }),
                { message: 'Release workflow run 1 did not complete' }
            );
            assert.strictEqual(readWorkflowRunResult.callCount, 120);
            assert.strictEqual(sleep.callCount, 120);
            assert.deepStrictEqual(deleteActionRequiredPullRequestRuns.firstCall.args[0], {
                branch: 'release/packtory',
                headHash: 'release-head'
            });
            assert.deepStrictEqual(createStatus.lastCall.args[0], {
                commitHash: 'release-head',
                context: 'Node.js',
                description: 'Dispatched release CI did not complete.',
                state: 'error',
                targetAddress: undefined
            });
        });
    });
});
