import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import {
    assertReleasePullRequestWasUpdated,
    createChangingReleaseGitClient,
    createDependencies,
    createPacktoryWithPlan,
    createPullRequestHead,
    createReleaseContentDependencies,
    createValidationDependencies,
    createValidationEnvironment,
    rejectWithUnknown
} from '../../test-libraries/release-pull-request-handler-test-support.ts';
import {
    createReleasePullRequestClient,
    createReleasePullRequestConfig
} from '../../test-libraries/runner-test-support.ts';
import { runReleasePullRequestHandler } from './release-pull-request-handler.ts';

suite('release-pull-request-handler', function () {
    suite('maintain', function () {
        suite('release content', function () {
            test('maintain requires no-dry-run', async function () {
                const { dependencies, log } = createDependencies({
                    flags: { command: 'maintain', noDryRun: false, releasePullRequestNumber: undefined }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.firstCall.args[0], 'Release PR writes require --no-dry-run');
            });

            test('maintain closes release state when no release content remains', async function () {
                const deleteRemoteBranch = fake.resolves(undefined);
                const closeOpenReleasePullRequests = fake.resolves(undefined);
                const { dependencies, log } = createDependencies({
                    createReleasePullRequestGitHubClient: fake.returns(
                        createReleasePullRequestClient({
                            closeOpenReleasePullRequests
                        })
                    ),
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
                    gitClient: {
                        commit: fake.resolves(undefined),
                        currentHead: fake.resolves('head'),
                        deleteRemoteBranch,
                        ensureClean: fake.resolves(undefined),
                        ensureTag: fake.resolves(undefined),
                        pushHeadToBranch: fake.resolves(undefined),
                        pushFollowTags: fake.resolves(undefined),
                        readChangedFiles: fake.resolves([])
                    }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.strictEqual(deleteRemoteBranch.callCount, 1);
                assert.deepStrictEqual(closeOpenReleasePullRequests.firstCall.args[0], {
                    baseBranch: 'main',
                    releaseBranch: 'release/packtory'
                });
                assert.strictEqual(log.lastCall.args[0], 'No release content remains');
            });

            test('maintain updates the release PR when changelog content is committed', async function () {
                const commit = fake.resolves(undefined);
                const createCommitOnBranch = fake.resolves('signed-release-head');
                const createOrUpdateReleasePullRequest = fake.resolves(12);
                const pushHeadToBranch = fake.resolves(undefined);
                const pushFollowTags = fake.resolves(undefined);
                const readChangedFiles = fake.resolves([
                    {
                        contentBase64: Buffer.from('updated changelog\n', 'utf8').toString('base64'),
                        kind: 'addition',
                        path: 'CHANGELOG.md'
                    }
                ]);
                const { dependencies, log } = createReleaseContentDependencies({
                    createReleasePullRequestGitHubClient: fake.returns(
                        createReleasePullRequestClient({
                            createCommitOnBranch,
                            createOrUpdateReleasePullRequest
                        })
                    ),
                    gitClient: createChangingReleaseGitClient({
                        commit,
                        pushFollowTags,
                        pushHeadToBranch,
                        readChangedFiles
                    })
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assertReleasePullRequestWasUpdated({
                    commit,
                    createCommitOnBranch,
                    createOrUpdateReleasePullRequest,
                    log,
                    readChangedFiles,
                    pushHeadToBranch,
                    pushFollowTags
                });
            });

            test('maintain returns failure when configured release PR CI fails', async function () {
                const { dependencies, log } = createReleaseContentDependencies({
                    configLoader: {
                        load: fake.resolves({
                            ...createReleasePullRequestConfig(),
                            releasePullRequest: {
                                githubActionsCi: {
                                    trigger: 'workflow-dispatch',
                                    workflowFile: 'ci.yml',
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
                            result: Result.err({ type: 'config', issues: [ 'Registry failed' ] }),
                            getReport() {
                                return createBuildReportFixture();
                            }
                        })
                    )
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'Release preparation failed');
            });
        });

        suite('configuration', function () {
            test('maintain rejects configs without valid packages', async function () {
                const { dependencies, log } = createDependencies({
                    configLoader: { load: fake.resolves({}) },
                    flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined }
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
                assert.strictEqual(log.lastCall.args[0], 'The loaded config is invalid for release PR management');
            });

            test('maintain rejects invalid release pull request settings', async function () {
                const { dependencies, log } = createDependencies({
                    configLoader: {
                        load: fake.resolves({
                            ...createReleasePullRequestConfig(),
                            releasePullRequest: {
                                githubActionsCi: {
                                    trigger: 'workflow-dispatch',
                                    workflowFile: 'ci.yml',
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
                    owner: 'owner',
                    repo: 'repo',
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
                    readPackageInfo: fake.resolves({
                        repository: { url: 'https://github.com/package-owner/package-repo' }
                    })
                });

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.deepStrictEqual(createReleasePullRequestGitHubClient.firstCall.args[0], {
                    owner: 'package-owner',
                    repo: 'package-repo',
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
                    owner: 'owner',
                    repo: 'repo',
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
                const getBranchHeadSha = fake.resolves('main-head');
                const getPullRequestHead = fake.resolves(createPullRequestHead());
                const { dependencies, log } = createValidationDependencies(
                    'pull_request',
                    { pull_request: { number: 12 } },
                    { getBranchHeadSha, getPullRequestHead }
                );

                assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
                assert.strictEqual(getBranchHeadSha.firstCall.args[0], 'main');
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
                    parentShas: [ 'feature-parent' ],
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
                    parentShas: [ 'base-sha' ]
                }));
                const { dependencies, log } = createValidationDependencies(
                    'merge_group',
                    { merge_group: { base_sha: 'base-sha', head_sha: 'head-sha' } },
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
                    { merge_group: { base_sha: 'base-sha' } }
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
                    'release-pr validate only supports pull_request and merge_group events'
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
            configLoader: {
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
