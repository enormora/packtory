import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import {
    assertReleasePullRequestWasUpdated,
    createDependencies,
    createEmptyReleaseChangelogEngine,
    createPacktoryWithPlan,
    createPullRequestHead,
    createReleaseContentDependencies,
    createValidationDependencies,
    createValidationEnvironment,
    rejectWithUnknown
} from '../../test-libraries/release-pull-request-handler-test-support.ts';
import {
    createReleasePullRequestClient,
    createReleasePullRequestConfiguration
} from '../../test-libraries/runner-test-support.ts';
import { toPreparedReleaseFile } from './release-output-files.ts';
import { runReleasePullRequestHandler } from './release-pull-request-handler.ts';

suite('release-pull-request-handler', function () {
    suite('release commit paths', function () {
        test('formats repository-relative paths with Windows separators', function () {
            assert.strictEqual(
                toPreparedReleaseFile('/repo\\workspace', { content: '', filePath: '/repo\\workspace\\CHANGELOG.md' })
                    .path,
                'CHANGELOG.md'
            );
        });

        test('keeps paths outside the repository unchanged', function () {
            assert.strictEqual(
                toPreparedReleaseFile('/repo/workspace', { content: '', filePath: '/repo/other/CHANGELOG.md' }).path,
                '/repo/other/CHANGELOG.md'
            );
        });
    });

    suite('maintain', function () {
        suite('release content', function () {
            test('maintain requires no-dry-run', async function () {
                const { dependencies, log } = createDependencies({
                    flags: { command: 'maintain', noDryRun: false, releasePullRequestNumber: undefined }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.firstCall.args[0], 'Release PR writes require --no-dry-run');
            });

            test('maintain skips dispatched release branch validation runs', async function () {
                const createReleasePullRequestGitHubClient = fake();
                const planReleaseAgainstLatestPublished = fake();
                const { dependencies, log } = createDependencies({
                    createReleasePullRequestGitHubClient,
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
                    packtory: createPacktoryWithPlan(planReleaseAgainstLatestPublished),
                    readEnvironmentVariable(name) {
                        return {
                            GH_TOKEN: 'token',
                            GITHUB_EVENT_NAME: 'workflow_dispatch',
                            GITHUB_REF_NAME: 'release/packtory',
                            GITHUB_REPOSITORY: 'owner/repo'
                        }[name];
                    }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.strictEqual(createReleasePullRequestGitHubClient.callCount, 0);
                assert.strictEqual(planReleaseAgainstLatestPublished.callCount, 0);
                assert.strictEqual(
                    log.lastCall.args[0],
                    'Skipping release PR maintenance during dispatched validation for release/packtory'
                );
            });

            for (
                const runEnvironment of [
                    {
                        eventName: 'workflow_dispatch',
                        referenceName: 'main'
                    },
                    {
                        eventName: 'push',
                        referenceName: 'release/packtory'
                    }
                ]
            ) {
                test(`maintain ${runEnvironment.eventName}/${runEnvironment.referenceName}`, async function () {
                    const createReleasePullRequestGitHubClient = fake.returns(createReleasePullRequestClient({}));
                    const { dependencies, log } = createDependencies({
                        createReleasePullRequestGitHubClient,
                        flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
                        readEnvironmentVariable(name) {
                            return {
                                GH_TOKEN: 'token',
                                GITHUB_EVENT_NAME: runEnvironment.eventName,
                                GITHUB_REF_NAME: runEnvironment.referenceName,
                                GITHUB_REPOSITORY: 'owner/repo'
                            }[name];
                        }
                    });

                    assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                    assert.strictEqual(createReleasePullRequestGitHubClient.callCount, 1);
                    assert.strictEqual(log.lastCall.args[0], 'No release content remains');
                });
            }

            test('prints a stack trace when a handler error is caught with trace enabled', async function () {
                const { dependencies, log } = createDependencies({
                    readEnvironmentVariable(name) {
                        return { GH_TOKEN: 'token' }[name];
                    },
                    readPackageInformation: fake.rejects(new Error('repository failed')),
                    trace: true
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.match(String(log.firstCall.args[0]), /Stack trace: Error: repository failed/u);
            });

            test('maintain closes release state when no release content remains', async function () {
                const deleteBranch = fake.resolves(undefined);
                const closeOpenReleasePullRequests = fake.resolves(undefined);
                const { dependencies, log } = createDependencies({
                    createReleasePullRequestGitHubClient: fake.returns(
                        createReleasePullRequestClient({
                            closeOpenReleasePullRequests,
                            deleteBranch
                        })
                    ),
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.deepStrictEqual(deleteBranch.firstCall.args, [ 'release/packtory' ]);
                assert.deepStrictEqual(closeOpenReleasePullRequests.firstCall.args[0], {
                    baseBranch: 'main',
                    releaseBranch: 'release/packtory'
                });
                assert.strictEqual(log.lastCall.args[0], 'No release content remains');
            });

            test('maintain updates the release PR when changelog content is prepared', async function () {
                const createCommitOnBranch = fake.resolves('signed-release-head');
                const createOrUpdateReleasePullRequest = fake.resolves(12);
                const { dependencies, fileManager, log } = createReleaseContentDependencies({
                    createReleasePullRequestGitHubClient: fake.returns(
                        createReleasePullRequestClient({
                            createCommitOnBranch,
                            createOrUpdateReleasePullRequest
                        })
                    )
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assertReleasePullRequestWasUpdated({
                    createCommitOnBranch,
                    createOrUpdateReleasePullRequest,
                    fileManager,
                    log
                });
            });

            test('maintain returns failure when configured release PR CI fails', async function () {
                const { dependencies, log } = createReleaseContentDependencies({
                    configurationLoader: {
                        load: fake.resolves({
                            ...createReleasePullRequestConfiguration(),
                            releasePullRequest: {
                                githubActionsContinuousIntegration: {
                                    trigger: 'workflow-dispatch',
                                    workflowFile: 'continuous-integration.yml',
                                    requiredStatusContexts: [ 'Missing job' ]
                                }
                            }
                        })
                    }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'Release PR #12 points at signed-release-head');
            });

            test('maintain reports release preparation failures', async function () {
                const { dependencies, log } = createDependencies({
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
                    packtory: createPacktoryWithPlan(
                        fake.resolves({
                            result: Result.err({ type: 'configuration', issues: [ 'Registry failed' ] }),
                            getReport() {
                                return createBuildReportFixture();
                            }
                        })
                    )
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'Release preparation failed');
            });

            test('maintain rejects changed releases without written changelogs', async function () {
                const { dependencies, log } = createReleaseContentDependencies({
                    createPullRequestLogEngine: fake.returns(createEmptyReleaseChangelogEngine())
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(
                    log.lastCall.args[0],
                    'No changelog files were written; changelog attribution found no pull requests for package.'
                );
            });
        });

        suite('configuration', function () {
            test('maintain rejects configs without valid packages', async function () {
                const { dependencies, log } = createDependencies({
                    configurationLoader: { load: fake.resolves({}) },
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'The loaded config is invalid for release PR management');
            });

            test('maintain rejects invalid release pull request settings', async function () {
                const { dependencies, log } = createDependencies({
                    configurationLoader: {
                        load: fake.resolves({
                            ...createReleasePullRequestConfiguration(),
                            releasePullRequest: {
                                githubActionsContinuousIntegration: {
                                    trigger: 'workflow-dispatch',
                                    workflowFile: 'continuous-integration.yml',
                                    requiredStatusContexts: []
                                }
                            }
                        })
                    },
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'The loaded config is invalid for release PR management');
            });

            test('maintain rejects non-object pr-log settings', async function () {
                const { dependencies, log } = createDependencies({
                    configurationLoader: {
                        load: fake.resolves({
                            ...createReleasePullRequestConfiguration(),
                            changelog: { pullRequestLog: null }
                        })
                    },
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'The loaded config is invalid for release PR management');
            });

            test('maintain creates an unauthenticated GitHub client when no token is set', async function () {
                const createReleasePullRequestGitHubClient = fake.returns(createReleasePullRequestClient({}));
                const { dependencies } = createDependencies({
                    createReleasePullRequestGitHubClient,
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
                    readEnvironmentVariable(name) {
                        return name === 'GITHUB_REPOSITORY' ? 'owner/repo' : undefined;
                    }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.deepStrictEqual(createReleasePullRequestGitHubClient.firstCall.args[0], {
                    applicationProgrammingInterfaceBaseAddress: 'https://api.github.com',
                    owner: 'owner',
                    repository: 'repo',
                    token: undefined
                });
            });

            test('maintain uses GITHUB_TOKEN and package repository when GitHub repository env is absent', async function () {
                const createReleasePullRequestGitHubClient = fake.returns(createReleasePullRequestClient({}));
                const { dependencies } = createDependencies({
                    createReleasePullRequestGitHubClient,
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
                    readEnvironmentVariable(name) {
                        return name === 'GITHUB_TOKEN' ? 'github-token' : undefined;
                    },
                    readPackageInformation: fake.resolves({
                        repository: { url: 'https://github.com/package-owner/package-repo' }
                    })
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.deepStrictEqual(createReleasePullRequestGitHubClient.firstCall.args[0], {
                    applicationProgrammingInterfaceBaseAddress: 'https://api.github.com',
                    owner: 'package-owner',
                    repository: 'package-repo',
                    token: 'github-token'
                });
            });

            test('maintain passes GITHUB_REPOSITORY owner and repo to the GitHub client', async function () {
                const createReleasePullRequestGitHubClient = fake.returns(createReleasePullRequestClient({}));
                const { dependencies } = createDependencies({
                    createReleasePullRequestGitHubClient,
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.deepStrictEqual(createReleasePullRequestGitHubClient.firstCall.args[0], {
                    applicationProgrammingInterfaceBaseAddress: 'https://api.github.com',
                    owner: 'owner',
                    repository: 'repo',
                    token: 'token'
                });
            });

            test('maintain passes GITHUB_API_BASE_URL to the GitHub client', async function () {
                const createReleasePullRequestGitHubClient = fake.returns(createReleasePullRequestClient({}));
                const { dependencies } = createDependencies({
                    createReleasePullRequestGitHubClient,
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
                    readEnvironmentVariable(name) {
                        return {
                            GH_TOKEN: 'token',
                            GITHUB_API_BASE_URL: 'http://127.0.0.1:1234',
                            GITHUB_REPOSITORY: 'owner/repo'
                        }[name];
                    }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.deepStrictEqual(createReleasePullRequestGitHubClient.firstCall.args[0], {
                    applicationProgrammingInterfaceBaseAddress: 'http://127.0.0.1:1234',
                    owner: 'owner',
                    repository: 'repo',
                    token: 'token'
                });
            });

            for (const repositoryName of [ 'owner', '/repo', 'owner/', 'owner/repo/extra' ]) {
                test(`maintain rejects invalid GITHUB_REPOSITORY value ${repositoryName}`, async function () {
                    const { dependencies, log } = createDependencies({
                        flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
                        readEnvironmentVariable(name) {
                            return { GH_TOKEN: 'token', GITHUB_REPOSITORY: repositoryName }[name];
                        }
                    });

                    assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                    assert.strictEqual(log.lastCall.args[0], 'GITHUB_REPOSITORY must use owner/repo format');
                });
            }
        });
    });

    suite('validate', function () {
        suite('pull request events', function () {
            test('validate accepts release pull request events that satisfy policy', async function () {
                const getBranchHeadHash = fake.resolves('main-head');
                const getPullRequestHead = fake.resolves(createPullRequestHead());
                const { dependencies, log } = createValidationDependencies(
                    'pull_request',
                    { pull_request: { number: 12 } },
                    { getBranchHeadHash, getPullRequestHead }
                );

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.strictEqual(getBranchHeadHash.firstCall.args[0], 'main');
                assert.strictEqual(getPullRequestHead.firstCall.args[0], 12);
                assert.strictEqual(log.lastCall.args[0], 'Release PR policy passed.');
            });

            test('validate rejects release pull request events that fail policy', async function () {
                const getPullRequestHead = fake.resolves(createPullRequestHead({ author: 'contributor' }));
                const { dependencies, log } = createValidationDependencies(
                    'pull_request',
                    { pull_request: { number: 12 } },
                    { getPullRequestHead }
                );

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'Release PRs must be authored by github-actions[bot]');
            });

            test('validate skips pull request policy for unrelated labels', async function () {
                const getPullRequestHead = fake.resolves(createPullRequestHead({
                    author: 'contributor',
                    labels: [ 'needs-review' ],
                    parentHashes: [ 'feature-parent' ],
                    title: 'Feature work'
                }));
                const { dependencies, log } = createValidationDependencies(
                    'pull_request',
                    { pull_request: { number: 13 } },
                    { getPullRequestHead }
                );

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.strictEqual(log.lastCall.args[0], 'Release PR policy passed.');
            });

            test('validate rejects pull request events without a pull request number', async function () {
                const { dependencies, log } = createValidationDependencies('pull_request', { pull_request: {} });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(
                    log.lastCall.args[0],
                    'GitHub pull_request event payload is missing pull_request.number'
                );
            });

            test('validate rejects events without pull request payloads for pull request validation', async function () {
                const { dependencies, log } = createValidationDependencies('pull_request', {});

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(
                    log.lastCall.args[0],
                    'GitHub pull_request event payload is missing pull_request.number'
                );
            });
        });

        suite('merge group events', function () {
            test('validate accepts merge group events whose release pull requests satisfy policy', async function () {
                const listCommitPullRequests = fake.resolves([ { number: 12 } ]);
                const getPullRequestHead = fake.resolves(createPullRequestHead({
                    parentHashes: [ 'base-sha' ]
                }));
                const { dependencies, log } = createValidationDependencies(
                    'merge_group',
                    { merge_group: { base_hash: 'base-sha', head_sha: 'head-sha' } },
                    { getPullRequestHead, listCommitPullRequests }
                );

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.strictEqual(listCommitPullRequests.firstCall.args[0], 'head-sha');
                assert.strictEqual(getPullRequestHead.firstCall.args[0], 12);
                assert.strictEqual(log.lastCall.args[0], 'Release PR policy passed.');
            });

            test('validate rejects merge group events without SHAs', async function () {
                const { dependencies, log } = createValidationDependencies(
                    'merge_group',
                    { merge_group: { head_sha: 'head-sha' } }
                );

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(
                    log.lastCall.args[0],
                    'GitHub merge_group event payload is missing merge group SHAs'
                );
            });

            test('validate rejects merge group events without a head SHA', async function () {
                const { dependencies, log } = createValidationDependencies(
                    'merge_group',
                    { merge_group: { base_hash: 'base-sha' } }
                );

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(
                    log.lastCall.args[0],
                    'GitHub merge_group event payload is missing merge group SHAs'
                );
            });

            test('validate rejects events without merge group payloads for merge group validation', async function () {
                const { dependencies, log } = createValidationDependencies('merge_group', {});

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(
                    log.lastCall.args[0],
                    'GitHub merge_group event payload is missing merge group SHAs'
                );
            });
        });

        suite('event payloads', function () {
            test('validate rejects unsupported GitHub event names', async function () {
                const { dependencies, log } = createValidationDependencies('workflow_run', { workflow_run: {} });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(
                    log.lastCall.args[0],
                    'release-pull-request validate only supports pull_request and merge_group events'
                );
            });

            test('validate rejects missing event path configuration', async function () {
                const { dependencies, log } = createDependencies({
                    flags: { command: 'validate', releasePullRequestNumber: undefined },
                    readEnvironmentVariable(name) {
                        return {
                            GH_TOKEN: 'token',
                            GITHUB_EVENT_NAME: 'pull_request',
                            GITHUB_REPOSITORY: 'owner/repo'
                        }[name];
                    }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'GITHUB_EVENT_PATH must be set');
            });

            test('validate rejects empty event path configuration', async function () {
                const { dependencies, log } = createDependencies({
                    flags: { command: 'validate', releasePullRequestNumber: undefined },
                    readEnvironmentVariable(name) {
                        return {
                            GH_TOKEN: 'token',
                            GITHUB_EVENT_NAME: 'pull_request',
                            GITHUB_EVENT_PATH: '',
                            GITHUB_REPOSITORY: 'owner/repo'
                        }[name];
                    }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'GITHUB_EVENT_PATH must be set');
            });

            test('validate rejects non-object event payloads', async function () {
                const { dependencies, log } = createDependencies({
                    fileManager: createFakeFileManager({ simulatedReadFileResponses: [ { value: '"invalid"' } ] }),
                    flags: { command: 'validate', releasePullRequestNumber: undefined },
                    readEnvironmentVariable: createValidationEnvironment('pull_request')
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'GitHub event payload must be an object');
            });

            test('validate rejects null event payloads', async function () {
                const { dependencies, log } = createValidationDependencies('pull_request', null);

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'GitHub event payload must be an object');
            });
        });
    });

    test('formats non-error command failures', async function () {
        const { dependencies, log } = createDependencies({
            configurationLoader: {
                async load() {
                    return rejectWithUnknown('plain failure');
                }
            },
            flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'plain failure');
    });
});
