import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import type { Packtory, ReleasePlanPackage } from '../../packtory/packtory.ts';
import {
    runReleasePullRequestHandler,
    type ReleasePullRequestHandlerDependencies
} from './release-pull-request-handler.ts';
import { createReleasePullRequestClient, createReleasePullRequestConfig } from './runner-test-support.ts';

function createReleasePackage(): ReleasePlanPackage {
    return {
        name: 'pkg',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed' as const,
        releaseClassification: 'substantive' as const,
        changed: true,
        previousGitHead: undefined,
        currentGitHead: 'current-head',
        latestRegistryMetadata: undefined,
        artifactFiles: [ 'dist/index.js' ],
        changedArtifactFiles: [ 'dist/index.js' ],
        sourceFiles: [ 'src/index.ts' ],
        changelogSourceFiles: [ 'src/index.ts' ],
        changelogDependencyNames: []
    };
}

async function unusedPacktoryMethod(): Promise<never> {
    throw new Error('unused packtory method');
}

async function rejectWithUnknown(reason: unknown): Promise<never> {
    return new Promise(function (_resolve, reject) {
        Reflect.apply(reject, undefined, [ reason ]);
    });
}

function createPacktoryWithPlan(
    planReleaseAgainstLatestPublished: Packtory['planReleaseAgainstLatestPublished']
): Packtory {
    return {
        analyzeReleaseAgainstLatestPublished: unusedPacktoryMethod,
        buildAndPublishAll: unusedPacktoryMethod,
        diffAgainstLatestPublished: unusedPacktoryMethod,
        packPackage: unusedPacktoryMethod,
        planReleaseAgainstLatestPublished,
        resolveAndLinkAll: unusedPacktoryMethod
    };
}

type CreatedReleasePullRequestDependencies = {
    readonly dependencies: ReleasePullRequestHandlerDependencies;
    readonly log: ReturnType<typeof fake>;
};

function createDependencies(
    overrides: Readonly<Partial<ReleasePullRequestHandlerDependencies>> = {}
): CreatedReleasePullRequestDependencies {
    const log = fake();
    const fileManager = createFakeFileManager();
    const releasePullRequestClient = createReleasePullRequestClient({
        createOrUpdateReleasePullRequest: fake.resolves(12),
        findDispatchedWorkflowRun: fake.resolves({ event: 'workflow_dispatch', observedRunIds: [ 1 ], runId: 1 }),
        getPullRequest: fake.resolves({
            author: 'github-actions[bot]',
            baseRef: 'main',
            changedFiles: [ 'CHANGELOG.md' ],
            headRef: 'release/packtory',
            headRepository: 'owner/repo',
            labels: [ 'release' ],
            mergeCommitSha: 'merge-sha',
            merged: true,
            number: 12,
            subject: 'Release packages',
            title: 'Prepare release'
        }),
        getPullRequestHead: fake.resolves({
            author: 'github-actions[bot]',
            changedFiles: [ 'CHANGELOG.md' ],
            headRef: 'release/packtory',
            labels: [ 'release' ],
            parentShas: [ 'main-head' ],
            subject: 'Release packages',
            title: 'Prepare release'
        }),
        readWorkflowRunResult: fake.resolves({
            conclusion: 'success',
            databaseId: 1,
            url: 'https://github.com/enormora/packtory/actions/runs/1',
            jobs: [ { conclusion: 'success', name: 'Node.js', url: 'https://run/job' } ]
        })
    });
    const dependencies: ReleasePullRequestHandlerDependencies = {
        createGitHubReleaseClient: fake.returns({ createReleaseIfMissing: fake.resolves('created') }),
        createPrLogEngine: fake.returns({
            collectMergedPullRequests: fake.resolves([ { id: 1, title: 'Fix package' } ]),
            filterPullRequestsByTargetFiles: fake.returns([ { id: 1, title: 'Fix package' } ]),
            readPullRequestLabels: fake.resolves(new Map([ [ 1, [ 'bug' ] ] ])),
            readPullRequestChangedFiles: fake.resolves(new Map([ [ 1, [ 'src/index.ts' ] ] ])),
            renderChangelog: fake.returns('## 1.0.1\n\n* Fix package (#1)\n'),
            renderGroupedTargetChangelog: fake.returns('## 1.0.1\n\n* Fix package (#1)\n'),
            renderTargetChangelog: fake.returns('## 1.0.1\n\n* Fix package (#1)\n'),
            resolveChangelogBaseRef: fake.resolves({ ref: 'pkg@1.0.0' }),
            resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: '1.0.0' }),
            resolvePullRequestLabels: fake.resolves([ { id: 1, label: 'bug', title: 'Fix package' } ]),
            updateChangelog: fake.returns('updated changelog')
        }),
        createReleasePullRequestGitHubClient: fake.returns(releasePullRequestClient),
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        fileManager,
        flags: { command: 'authorize-publish', releasePullRequestNumber: undefined },
        gitClient: {
            commit: fake.resolves(undefined),
            currentHead: fake.resolves('head'),
            deleteRemoteBranch: fake.resolves(undefined),
            ensureClean: fake.resolves(undefined),
            ensureTag: fake.resolves(undefined),
            pushHeadToBranch: fake.resolves(undefined),
            pushFollowTags: fake.resolves(undefined)
        },
        log(message) {
            log(message);
        },
        packtory: createPacktoryWithPlan(
            fake.resolves({
                result: Result.ok({ packages: [] }),
                getReport() {
                    return createBuildReportFixture();
                }
            })
        ),
        readEnvironmentVariable(name) {
            return { GH_TOKEN: 'token', GITHUB_REPOSITORY: 'owner/repo', GITHUB_SHA: 'merge-sha' }[name];
        },
        async readPackageInfo() {
            return { repository: { url: 'https://github.com/owner/repo' } };
        },
        sleep: fake.resolves(undefined),
        spinnerRenderer: { stopAll: fake() },
        configLoader: { load: fake.resolves(createReleasePullRequestConfig()) },
        workingDirectory: '/repo',
        ...overrides
    };
    return { dependencies, log };
}

function createChangingReleaseGitClient(
    overrides: Readonly<Partial<ReleasePullRequestHandlerDependencies['gitClient']>> = {}
): ReleasePullRequestHandlerDependencies['gitClient'] {
    const heads = [ 'main-head', 'release-head' ];
    return {
        commit: fake.resolves(undefined),
        async currentHead() {
            return heads.shift() ?? 'release-head';
        },
        deleteRemoteBranch: fake.resolves(undefined),
        ensureClean: fake.resolves(undefined),
        ensureTag: fake.resolves(undefined),
        pushHeadToBranch: fake.resolves(undefined),
        pushFollowTags: fake.resolves(undefined),
        ...overrides
    };
}

function createReleaseContentDependencies(
    overrides: Readonly<Partial<ReleasePullRequestHandlerDependencies>> = {}
): CreatedReleasePullRequestDependencies {
    return createDependencies({
        flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
        gitClient: createChangingReleaseGitClient(),
        packtory: createPacktoryWithPlan(
            fake.resolves({
                result: Result.ok({ packages: [ createReleasePackage() ] }),
                getReport() {
                    return createBuildReportFixture();
                }
            })
        ),
        ...overrides
    });
}

type ReleasePullRequestUpdateAssertion = {
    readonly commit: ReturnType<typeof fake>;
    readonly createOrUpdateReleasePullRequest: ReturnType<typeof fake>;
    readonly log: ReturnType<typeof fake>;
    readonly pushHeadToBranch: ReturnType<typeof fake>;
    readonly pushFollowTags: ReturnType<typeof fake>;
};

function assertReleasePullRequestWasUpdated(input: ReleasePullRequestUpdateAssertion): void {
    assert.strictEqual(input.commit.callCount, 1);
    assert.deepStrictEqual(input.pushHeadToBranch.firstCall.args, [ 'release/packtory' ]);
    assert.strictEqual(input.pushFollowTags.callCount, 0);
    assert.deepStrictEqual(input.createOrUpdateReleasePullRequest.firstCall.args[0], {
        baseBranch: 'main',
        body: 'Updates changelogs for the next release.',
        label: 'release',
        releaseBranch: 'release/packtory',
        title: 'Prepare release'
    });
    assert.strictEqual(input.log.lastCall.args[0], 'Release PR #12 points at release-head');
}

suite('release-pull-request-handler', function () {
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
                pushFollowTags: fake.resolves(undefined)
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
        const createOrUpdateReleasePullRequest = fake.resolves(12);
        const pushHeadToBranch = fake.resolves(undefined);
        const pushFollowTags = fake.resolves(undefined);
        const { dependencies, log } = createReleaseContentDependencies({
            createReleasePullRequestGitHubClient: fake.returns(
                createReleasePullRequestClient({
                    createOrUpdateReleasePullRequest
                })
            ),
            gitClient: createChangingReleaseGitClient({ commit, pushFollowTags, pushHeadToBranch })
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assertReleasePullRequestWasUpdated({
            commit,
            createOrUpdateReleasePullRequest,
            log,
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
        assert.strictEqual(log.lastCall.args[0], 'Release PR #12 points at release-head');
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
