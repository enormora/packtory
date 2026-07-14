import assert from 'node:assert';
import type { PrLogEngine, PullRequestChangedFile } from '@pr-log/core';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type { BuildAndPublishResult } from '../../packtory/package-processor.ts';
import type { Packtory, ReleasePlanOutcome, ReleasePlanPackage, ReleasePlanResult } from '../../packtory/packtory.ts';
import { createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import { createGitHubReleaseClientFixture } from '../../test-libraries/runner-test-support.ts';
import { runReleaseHandler, type ReleaseHandlerDeps } from './release-handler.ts';

const validConfig = {
    packages: [
        {
            sourcesFolder: 'src/pkg-a',
            mainPackageJson: { type: 'module' },
            name: 'pkg-a',
            roots: { main: { js: 'index.js' } },
            publishSettings: { access: 'public' }
        }
    ],
    changelog: { outputs: [ { kind: 'github-release' } ] }
} as const;

function releasePackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return {
        name: 'pkg-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: 'substantive',
        changed: true,
        previousGitHead: 'old-head',
        currentGitHead: 'release-head',
        latestRegistryMetadata: { version: '1.0.0', publishedAt: undefined, gitHead: 'old-head' },
        artifactFiles: [ 'index.js' ],
        changedArtifactFiles: [ 'index.js' ],
        sourceFiles: [ 'src/pkg-a/index.ts' ],
        changelogDependencyNames: [],
        changelogDependencyUpdates: [],
        changelogSourceFiles: [ 'src/pkg-a/index.ts' ],
        ...overrides
    };
}

function currentHeadPublishedPackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return releasePackage({
        artifactState: 'unchanged',
        changed: false,
        latestRegistryMetadata: { version: '1.0.1', publishedAt: undefined, gitHead: 'release-head' },
        ...overrides
    });
}

function releasePlanOutcomeFrom(result: ReleasePlanResult): ReleasePlanOutcome {
    return {
        result,
        getReport() {
            return createBuildReportFixture();
        }
    };
}

function releasePlanOutcome(packages: readonly ReleasePlanPackage[]): ReleasePlanOutcome {
    return releasePlanOutcomeFrom(Result.ok({ packages }));
}

function publishResult(name: string, version: string): BuildAndPublishResult {
    return {
        status: 'new-version',
        bundle: { name, version },
        publication: { type: 'published' },
        extraFiles: [],
        previousReleaseArtifacts: { isJust: false }
    } as unknown as BuildAndPublishResult;
}

function failedPublish(): SinonSpy {
    return fake.resolves({
        result: Result.err({ type: 'config', issues: [ 'publish failed' ] }),
        getReport() {
            return createBuildReportFixture();
        }
    });
}

function failedPartialPublish(): SinonSpy {
    return fake.resolves({
        result: Result.err({
            type: 'partial',
            succeeded: [
                {
                    ...publishResult('pkg-a', '1.0.1'),
                    publication: { type: 'staged', stageId: 'stage-id' }
                }
            ],
            failures: [ new Error('publish failed') ]
        }),
        getReport() {
            return createBuildReportFixture();
        }
    });
}

function failedReleasePlan(): SinonSpy {
    return fake.resolves(
        releasePlanOutcomeFrom(
            Result.err({ type: 'config', issues: [ 'invalid release plan' ] }) as ReleasePlanResult
        )
    );
}

function changedFile(path: string): PullRequestChangedFile {
    return { path, previousPath: undefined, status: 'modified', additions: 1, deletions: 0, changes: 1 };
}

function createEngine(): PrLogEngine {
    const pullRequest = { id: 1, title: 'Fix package' };
    const releaseNotes = '## pkg-a 1.0.1\n\n* Fix package';
    return {
        collectMergedPullRequests: fake.resolves([ pullRequest ]),
        filterPullRequestsByTargetFiles: fake.returns([ pullRequest ]),
        renderChangelog: fake.returns(''),
        renderGroupedTargetChangelog: fake.returns(releaseNotes),
        readPullRequestChangedFiles: fake.resolves(
            new Map([ [ pullRequest.id, [ changedFile('src/pkg-a/index.ts') ] ] ])
        ),
        readPullRequestLabels: fake.resolves(new Map([ [ pullRequest.id, [ 'bug' ] ] ])),
        extractChangelogReleaseSection: fake(function (): never {
            throw new Error('unexpected changelog section extraction');
        }),
        renderTargetChangelog: fake.returns(releaseNotes),
        resolveChangelogBaseRef: fake.resolves({ ref: 'old-head' }),
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest-semver' }),
        resolvePullRequestLabels: fake.resolves([ { ...pullRequest, label: 'bug' } ]),
        resolveVersionNumber: fake.returns('1.0.1'),
        updateChangelog: fake.returns('')
    };
}

type DependencyOverrides = {
    readonly buildAndPublishAll?: SinonSpy;
    readonly createGitHubReleaseClient?: SinonSpy;
    readonly flags?: ReleaseHandlerDeps['flags'];
    readonly log?: SinonSpy;
    readonly packages?: readonly ReleasePlanPackage[];
    readonly planReleaseAgainstLatestPublished?: SinonSpy;
    readonly readEnvironmentVariable?: ReleaseHandlerDeps['readEnvironmentVariable'];
    readonly readPackageInfo?: ReleaseHandlerDeps['readPackageInfo'];
};
type CreatedReleaseHandlerDeps = ReleaseHandlerDeps & {
    readonly buildAndPublishAll: SinonSpy;
    readonly createGitHubReleaseClient: SinonSpy;
    readonly log: SinonSpy;
};
type CompleteDependencyOverrides = Required<DependencyOverrides>;

function createPlanRelease(
    packages: readonly ReleasePlanPackage[]
): SinonSpy {
    return fake.resolves(releasePlanOutcome(packages));
}

function createPacktory(
    buildAndPublishAll: SinonSpy,
    planReleaseAgainstLatestPublished: SinonSpy
): Packtory {
    async function unusedPacktoryMethod(): Promise<never> {
        throw new Error('unused packtory method');
    }
    return {
        analyzeReleaseAgainstLatestPublished: unusedPacktoryMethod,
        buildAndPublishAll,
        diffAgainstLatestPublished: unusedPacktoryMethod,
        packPackage: unusedPacktoryMethod,
        planReleaseAgainstLatestPublished,
        resolveAndLinkAll: unusedPacktoryMethod
    };
}

function createDefaultPublish(): SinonSpy {
    return fake.resolves({
        result: Result.ok([ publishResult('pkg-a', '1.0.1') ]),
        getReport() {
            return createBuildReportFixture();
        }
    });
}

function createDefaultFlags(): ReleaseHandlerDeps['flags'] {
    return {
        githubRelease: false,
        noDryRun: false,
        publish: false,
        push: false,
        tag: false
    };
}

function readDefaultEnvironmentVariable(name: 'GH_TOKEN' | 'GITHUB_TOKEN'): string | undefined {
    return name === 'GH_TOKEN' ? 'gh-token' : undefined;
}

async function readDefaultPackageInfo(): Promise<Readonly<Record<string, unknown>>> {
    return { repository: { url: 'https://github.com/owner/repo' } };
}

function createCompleteDependencyOverrides(overrides: DependencyOverrides): CompleteDependencyOverrides {
    const packages = overrides.packages ?? [ releasePackage() ];
    return {
        buildAndPublishAll: createDefaultPublish(),
        createGitHubReleaseClient: fake.returns(createGitHubReleaseClientFixture({})),
        flags: createDefaultFlags(),
        log: fake(),
        packages,
        planReleaseAgainstLatestPublished: createPlanRelease(packages),
        readEnvironmentVariable: readDefaultEnvironmentVariable,
        readPackageInfo: readDefaultPackageInfo,
        ...overrides
    };
}

function createDependencies(overrides: DependencyOverrides = {}): CreatedReleaseHandlerDeps {
    const completeOverrides = createCompleteDependencyOverrides(overrides);
    return {
        buildAndPublishAll: completeOverrides.buildAndPublishAll,
        createGitHubReleaseClient: completeOverrides.createGitHubReleaseClient,
        createPrLogEngine: fake.returns(createEngine()),
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        fileManager: {
            readFile: fake.resolves('')
        },
        flags: completeOverrides.flags,
        log: completeOverrides.log,
        packtory: createPacktory(
            completeOverrides.buildAndPublishAll,
            completeOverrides.planReleaseAgainstLatestPublished
        ),
        readEnvironmentVariable: completeOverrides.readEnvironmentVariable,
        readPackageInfo: completeOverrides.readPackageInfo,
        spinnerRenderer: { stopAll: fake() },
        configLoader: { load: fake.resolves(validConfig) },
        workingDirectory: '/repo'
    };
}

async function assertNoReleaseWork(deps: CreatedReleaseHandlerDeps): Promise<void> {
    assert.strictEqual(await runReleaseHandler(deps), 0);
    assert.strictEqual(deps.log.firstCall.args[0], 'No packages need release.');
    assert.strictEqual(deps.buildAndPublishAll.callCount, 0);
}

function assertAnnotatedTagCreated(ensureAnnotatedTag: SinonSpy): void {
    assert.deepStrictEqual(ensureAnnotatedTag.firstCall.args, [
        { tagName: 'pkg-a@1.0.1', message: 'pkg-a@1.0.1', targetHead: 'release-head' }
    ]);
}

suite('release-handler', function () {
    suite('plan and flag validation', function () {
        test('prints the release plan when no release action is requested', async function () {
            const deps = createDependencies();

            assert.strictEqual(await runReleaseHandler(deps), 0);
            assert.strictEqual(deps.log.firstCall.args[0], 'Release plan:\n- pkg-a: 1.0.0 -> 1.0.1 (changed)');
            assert.strictEqual(deps.buildAndPublishAll.callCount, 0);
        });

        test('prints unpublished packages in the release plan', async function () {
            const deps = createDependencies({
                packages: [ releasePackage({ previousVersion: undefined }) ]
            });

            assert.strictEqual(await runReleaseHandler(deps), 0);
            assert.strictEqual(deps.log.firstCall.args[0], 'Release plan:\n- pkg-a: unpublished -> 1.0.1 (changed)');
        });

        test('prints no release work when the plan has no changed packages', async function () {
            const deps = createDependencies({
                packages: [ releasePackage({ artifactState: 'unchanged', changed: false }) ]
            });

            await assertNoReleaseWork(deps);
        });

        test('requires no-dry-run for release writes', async function () {
            const deps = createDependencies({
                flags: { publish: true, tag: false, push: false, githubRelease: false, noDryRun: false }
            });

            assert.strictEqual(await runReleaseHandler(deps), 1);
            assert.strictEqual(deps.log.firstCall.args[0], 'Release writes require --no-dry-run');
            assert.strictEqual(deps.buildAndPublishAll.callCount, 0);
        });

        test('requires tag before push', async function () {
            const deps = createDependencies({
                flags: { publish: false, tag: false, push: true, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(deps), 1);
            assert.strictEqual(deps.log.firstCall.args[0], '--push requires --tag');
        });

        test('requires tag push before GitHub release creation', async function () {
            const deps = createDependencies({
                flags: { publish: false, tag: true, push: false, githubRelease: true, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(deps), 1);
            assert.strictEqual(deps.log.firstCall.args[0], '--github-release requires --tag --push');
        });

        test('prints multiple flag issues on separate lines', async function () {
            const deps = createDependencies({
                flags: { publish: false, tag: false, push: true, githubRelease: true, noDryRun: false }
            });

            assert.strictEqual(await runReleaseHandler(deps), 1);
            assert.strictEqual(
                deps.log.firstCall.args[0],
                '--push requires --tag\n--github-release requires --tag --push\nRelease writes require --no-dry-run'
            );
        });

        test('returns failure when release planning fails', async function () {
            const deps = createDependencies({
                planReleaseAgainstLatestPublished: failedReleasePlan()
            });

            assert.strictEqual(await runReleaseHandler(deps), 1);
            assert.match(String(deps.log.lastCall.args[0]), /invalid release plan/u);
        });
    });

    suite('publishing', function () {
        test('publishes packages and creates GitHub tags and releases', async function () {
            const ensureAnnotatedTag = fake.resolves('created');
            const createReleaseIfMissing = fake.resolves('created');
            const createGitHubReleaseClient = fake.returns(
                createGitHubReleaseClientFixture({ createReleaseIfMissing, ensureAnnotatedTag })
            );
            const deps = createDependencies({
                createGitHubReleaseClient,
                flags: { publish: true, tag: true, push: true, githubRelease: true, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(deps), 0);
            assert.deepStrictEqual(deps.buildAndPublishAll.firstCall.args, [
                validConfig,
                { dryRun: false, stage: false, collectReport: false }
            ]);
            assert.deepStrictEqual(createGitHubReleaseClient.firstCall.args, [
                { owner: 'owner', repo: 'repo', token: 'gh-token' }
            ]);
            assert.deepStrictEqual(ensureAnnotatedTag.firstCall.args, [
                { tagName: 'pkg-a@1.0.1', message: 'pkg-a@1.0.1', targetHead: 'release-head' }
            ]);
            assert.deepStrictEqual(createReleaseIfMissing.firstCall.args, [
                { tagName: 'pkg-a@1.0.1', name: 'pkg-a@1.0.1', body: '## pkg-a 1.0.1\n\n* Fix package' }
            ]);
            assert.strictEqual(deps.log.lastCall.args[0], 'Release completed.');
        });

        test('publishes without creating GitHub tags when only publish is requested', async function () {
            const deps = createDependencies({
                flags: { publish: true, tag: false, push: false, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(deps), 0);
            assert.deepStrictEqual([
                deps.buildAndPublishAll.callCount,
                deps.createGitHubReleaseClient.callCount
            ], [ 1, 0 ]);
            assert.strictEqual(deps.log.lastCall.args[0], 'Release completed.');
        });

        test('does not release current-head packages when only publish is requested', async function () {
            const deps = createDependencies({
                flags: { publish: true, tag: false, push: false, githubRelease: false, noDryRun: true },
                packages: [ currentHeadPublishedPackage() ]
            });

            await assertNoReleaseWork(deps);
        });

        test('reports publish failures', async function () {
            const deps = createDependencies({
                buildAndPublishAll: failedPublish(),
                flags: { publish: true, tag: false, push: false, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(deps), 1);
            assert.match(String(deps.log.lastCall.args[0]), /publish failed/u);
        });

        test('does not print staged receipts for release publish partial failures', async function () {
            const deps = createDependencies({
                buildAndPublishAll: failedPartialPublish(),
                flags: { publish: true, tag: false, push: false, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(deps), 1);
            assert.doesNotMatch(String(deps.log.lastCall.args[0]), /Staged packages/u);
        });

        test('creates retry tags after publish is requested for current-head packages', async function () {
            const ensureAnnotatedTag = fake.resolves('existing');
            const deps = createDependencies({
                createGitHubReleaseClient: fake.returns(createGitHubReleaseClientFixture({ ensureAnnotatedTag })),
                flags: { publish: true, tag: true, push: true, githubRelease: false, noDryRun: true },
                packages: [ currentHeadPublishedPackage() ]
            });

            assert.strictEqual(await runReleaseHandler(deps), 0);
            assert.strictEqual(deps.buildAndPublishAll.callCount, 0);
            assertAnnotatedTagCreated(ensureAnnotatedTag);
        });

        test('does not create GitHub tags for publish results outside the release plan', async function () {
            const deps = createDependencies({
                buildAndPublishAll: fake.resolves({
                    result: Result.ok([ publishResult('other-pkg', '1.0.1') ]),
                    getReport() {
                        return createBuildReportFixture();
                    }
                }),
                flags: { publish: true, tag: true, push: true, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(deps), 0);
            assert.strictEqual(deps.createGitHubReleaseClient.callCount, 0);
        });
    });

    suite('GitHub release publishing', function () {
        test('rejects tagging changed packages without publishing them first', async function () {
            const deps = createDependencies({
                flags: { publish: false, tag: true, push: true, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(deps), 1);
            assert.strictEqual(
                deps.log.lastCall.args[0],
                '--tag requires --publish unless registry latest already matches the current Git head'
            );
            assert.strictEqual(deps.buildAndPublishAll.callCount, 0);
        });

        test('tags current-head registry packages without publishing during retries', async function () {
            const ensureAnnotatedTag = fake.resolves('existing');
            const deps = createDependencies({
                createGitHubReleaseClient: fake.returns(createGitHubReleaseClientFixture({ ensureAnnotatedTag })),
                flags: { publish: false, tag: true, push: true, githubRelease: false, noDryRun: true },
                packages: [ currentHeadPublishedPackage({ artifactState: 'changed' }) ]
            });

            assert.strictEqual(await runReleaseHandler(deps), 0);
            assert.strictEqual(deps.buildAndPublishAll.callCount, 0);
            assertAnnotatedTagCreated(ensureAnnotatedTag);
        });

        test('does not tag retry packages when registry metadata points at another commit', async function () {
            const deps = createDependencies({
                flags: { publish: false, tag: true, push: true, githubRelease: false, noDryRun: true },
                packages: [
                    currentHeadPublishedPackage({
                        latestRegistryMetadata: { version: '1.0.1', publishedAt: undefined, gitHead: 'other-head' }
                    })
                ]
            });

            assert.strictEqual(await runReleaseHandler(deps), 0);
            assert.strictEqual(deps.log.firstCall.args[0], 'No packages need release.');
            assert.strictEqual(deps.createGitHubReleaseClient.callCount, 0);
        });

        test('does not tag retry packages without registry metadata or a current head', async function () {
            const deps = createDependencies({
                flags: { publish: false, tag: true, push: true, githubRelease: false, noDryRun: true },
                packages: [
                    currentHeadPublishedPackage({
                        currentGitHead: undefined,
                        latestRegistryMetadata: { version: '1.0.1', publishedAt: undefined, gitHead: undefined }
                    })
                ]
            });

            assert.strictEqual(await runReleaseHandler(deps), 0);
            assert.strictEqual(deps.log.firstCall.args[0], 'No packages need release.');
        });

        test('rejects GitHub tagging when the release plan has no current head', async function () {
            const deps = createDependencies({
                flags: { publish: true, tag: true, push: true, githubRelease: false, noDryRun: true },
                packages: [ releasePackage({ currentGitHead: undefined }) ]
            });

            assert.strictEqual(await runReleaseHandler(deps), 1);
            assert.strictEqual(
                deps.log.lastCall.args[0],
                'GitHub tag target for "pkg-a@1.0.1" could not be determined'
            );
        });

        test('requires a GitHub token when tags are created through the GitHub API', async function () {
            const deps = createDependencies({
                flags: { publish: true, tag: true, push: true, githubRelease: false, noDryRun: true },
                readEnvironmentVariable() {
                    return undefined;
                }
            });

            assert.strictEqual(await runReleaseHandler(deps), 1);
            assert.match(String(deps.log.lastCall.args[0]), /GH_TOKEN or GITHUB_TOKEN/u);
        });

        test('uses GITHUB_TOKEN when GH_TOKEN is unset', async function () {
            const createGitHubReleaseClient = fake.returns(createGitHubReleaseClientFixture({}));
            const deps = createDependencies({
                createGitHubReleaseClient,
                flags: { publish: true, tag: true, push: true, githubRelease: false, noDryRun: true },
                readEnvironmentVariable(name) {
                    return name === 'GITHUB_TOKEN' ? 'github-token' : undefined;
                }
            });

            assert.strictEqual(await runReleaseHandler(deps), 0);
            assert.deepStrictEqual(createGitHubReleaseClient.firstCall.args, [
                { owner: 'owner', repo: 'repo', token: 'github-token' }
            ]);
        });
    });
});
