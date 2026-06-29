import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { ReleasePlanPackage } from '../../packtory/packtory.ts';
import { createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import { createReleasePullRequestConfig } from '../../test-libraries/runner-test-support.ts';
import {
    createDependencies,
    createPacktoryWithPlan,
    createReleasePullRequestClient,
    type CreatedReleasePullRequestDependencies
} from '../../test-libraries/release-pull-request-handler-test-support.ts';
import {
    runReleasePullRequestHandler,
    type ReleasePullRequestHandlerDependencies
} from './release-pull-request-handler.ts';

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

async function rejectWithUnknown(reason: unknown): Promise<never> {
    return new Promise(function (_resolve, reject) {
        Reflect.apply(reject, undefined, [ reason ]);
    });
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
