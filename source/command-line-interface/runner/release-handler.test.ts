import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type { PrLogEngine, PrLogEngineOptions } from '@pr-log/core';
import type { Packtory, ReleasePlanOutcome, ReleasePlanPackage } from '../../packtory/packtory.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runReleaseHandler, type ReleaseHandlerDeps } from './release-handler.ts';

type ReleaseFlags = ReleaseHandlerDeps['flags'];

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
    changelog: {
        outputs: [{ kind: 'repository-file', path: 'CHANGELOG.md' }]
    }
} as const;

function createReleasePackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return {
        name: 'pkg-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        changed: true,
        previousGitHead: 'old-head',
        currentGitHead: 'new-head',
        latestRegistryMetadata: { version: '1.0.0', publishedAt: undefined, gitHead: 'old-head' },
        artifactFiles: ['index.js'],
        changedArtifactFiles: ['index.js'],
        sourceFiles: ['source/pkg-a.ts'],
        changelogSourceFiles: ['source/pkg-a.ts'],
        ...overrides
    };
}

function createCurrentHeadRetryPackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return createReleasePackage({
        changed: false,
        artifactState: 'unchanged',
        latestRegistryMetadata: {
            version: '1.0.1',
            publishedAt: undefined,
            gitHead: 'new-head'
        },
        ...overrides
    });
}

function createReleasePlanOutcome(packages: readonly ReleasePlanPackage[]): ReleasePlanOutcome {
    return {
        result: Result.ok({ packages }),
        getReport() {
            return {
                schemaVersion: 1 as const,
                generatedAt: '2026-06-13T00:00:00.000Z',
                packages: {},
                aggregate: { crossBundleLinks: [] }
            };
        }
    };
}

function createReleasePlanOutcomesForPackage(packagePlan: ReleasePlanPackage): readonly ReleasePlanOutcome[] {
    return [createReleasePlanOutcome([packagePlan])];
}

function createPublishVersionSpy(order: string[], version: string): SinonSpy {
    return fake(async () => {
        order.push('publish');
        return {
            result: Result.ok([{ bundle: { name: 'pkg-a', version } }]),
            getReport() {
                return undefined;
            }
        };
    });
}

function createEngine(): PrLogEngine {
    return {
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest-semver' }),
        resolveChangelogBaseRef: fake.resolves({ ref: 'old-head' }),
        collectMergedPullRequests: fake(async (input: { readonly githubRepo: string }) => {
            assert.strictEqual(input.githubRepo, 'enormora/packtory');
            return [{ id: 1, title: 'Fix package' }];
        }),
        readPullRequestChangedFiles: fake(async (input: { readonly githubRepo: string }) => {
            assert.strictEqual(input.githubRepo, 'enormora/packtory');
            return new Map([[1, ['source/pkg-a.ts']]]);
        }),
        readPullRequestLabels: fake.resolves(new Map([[1, ['bug']]])),
        filterPullRequestsByTargetFiles: fake((input: { readonly pullRequests: readonly unknown[] }) => {
            return input.pullRequests;
        }),
        resolvePullRequestLabels: fake(async (input: { readonly githubRepo: string }) => {
            assert.strictEqual(input.githubRepo, 'enormora/packtory');
            return [{ id: 1, title: 'Fix package', label: 'bug' }];
        }),
        renderGroupedTargetChangelog: fake.returns('## pkg-a 1.0.1\n'),
        renderTargetChangelog: fake.returns('## pkg-a 1.0.1\n'),
        updateChangelog: fake((input: { readonly generatedChangelogMarkdown: string }) => {
            return input.generatedChangelogMarkdown;
        }),
        renderChangelog: fake.returns('')
    } as unknown as PrLogEngine;
}

const defaultFlags: ReleaseFlags = {
    commit: false,
    githubRelease: false,
    noDryRun: false,
    publish: false,
    push: false,
    tag: false,
    writeChangelog: false
};
const githubReleaseFlags = { githubRelease: true, noDryRun: true, push: true, tag: true } as const;
const noReleaseMessage = 'No packages need release.';

type Scenario = {
    readonly buildAndPublishAll?: SinonSpy;
    readonly config?: unknown;
    readonly configLoader?: ConfigLoader;
    readonly createGitHubReleaseClient?: SinonSpy;
    readonly flags?: Partial<ReleaseFlags>;
    readonly readEnvironmentVariable?: (name: 'GH_TOKEN' | 'GITHUB_TOKEN') => string | undefined;
    readonly readPackageInfo?: () => Promise<Record<string, unknown>>;
    readonly order?: string[];
    readonly planOutcomes?: readonly ReleasePlanOutcome[];
};

function createReleasePlanFailureOutcome(): ReleasePlanOutcome {
    return {
        result: Result.err({ type: 'config', issues: ['bad config'] }),
        getReport() {
            return {
                schemaVersion: 1 as const,
                generatedAt: '2026-06-13T00:00:00.000Z',
                packages: {},
                aggregate: { crossBundleLinks: [] }
            };
        }
    };
}

function createReleaseHandlerDeps(scenario: Scenario = {}): ReleaseHandlerDeps {
    const order = scenario.order ?? [];
    const planOutcomes = scenario.planOutcomes ?? [createReleasePlanOutcome([createReleasePackage()])];
    let planCallCount = 0;
    const stopAll = fake();
    const planReleaseAgainstLatestPublished = fake(async () => {
        order.push('plan');
        const outcome = planOutcomes[planCallCount] ?? planOutcomes.at(-1);
        planCallCount += 1;
        return outcome as ReleasePlanOutcome;
    });
    return {
        createGitHubReleaseClient:
            scenario.createGitHubReleaseClient ??
            fake(() => {
                return {
                    async createReleaseIfMissing() {
                        order.push('github-release');
                        return 'created' as const;
                    }
                };
            }),
        createPrLogEngine(options: Readonly<PrLogEngineOptions>) {
            if (scenario.readEnvironmentVariable === undefined) {
                assert.strictEqual(options.githubToken, 'gh-token');
            }
            return createEngine();
        },
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        fileManager: createFakeFileManager(),
        flags: { ...defaultFlags, ...scenario.flags },
        gitClient: {
            async commit(filePaths, message) {
                order.push(`commit:${filePaths.join(',')}:${message}`);
            },
            async currentHead() {
                order.push('head');
                return 'new-head';
            },
            async ensureClean() {
                order.push('clean');
            },
            async ensureTag(tagName) {
                order.push(`tag:${tagName}`);
            },
            async pushFollowTags() {
                order.push('push');
            }
        },
        log: fake(),
        packtory: {
            buildAndPublishAll:
                scenario.buildAndPublishAll ??
                fake(async () => {
                    order.push('publish');
                    return {
                        result: Result.ok([{ bundle: { name: 'pkg-a', version: '1.0.1' } }]),
                        getReport() {
                            return undefined;
                        }
                    };
                }),
            planReleaseAgainstLatestPublished
        } as unknown as Packtory,
        readEnvironmentVariable(name) {
            if (scenario.readEnvironmentVariable !== undefined) {
                return scenario.readEnvironmentVariable(name);
            }
            return name === 'GH_TOKEN' ? 'gh-token' : undefined;
        },
        readPackageInfo:
            scenario.readPackageInfo ??
            (async () => {
                return { repository: { url: 'https://github.com/enormora/packtory' } };
            }),
        spinnerRenderer: { stopAll } as unknown as TerminalSpinnerRenderer,
        configLoader:
            scenario.configLoader ??
            ({ load: fake.resolves(scenario.config ?? validConfig) } as unknown as ConfigLoader),
        workingDirectory: '/repo'
    };
}

async function runScenario(scenario: Scenario): Promise<{
    readonly code: number;
    readonly deps: ReleaseHandlerDeps;
}> {
    const deps = createReleaseHandlerDeps(scenario);
    return { code: await runReleaseHandler(deps), deps };
}

function readFirstLogArgs(deps: ReleaseHandlerDeps): readonly unknown[] {
    return (deps.log as SinonSpy).firstCall.args;
}

async function assertFlagError(flags: Partial<ReleaseFlags>, expected: string): Promise<ReleaseHandlerDeps> {
    const { code, deps } = await runScenario({ flags });

    assert.strictEqual(code, 1);
    assert.strictEqual((deps.packtory.planReleaseAgainstLatestPublished as SinonSpy).callCount, 0);
    assert.deepStrictEqual(readFirstLogArgs(deps), [expected]);
    return deps;
}

async function assertNoReleaseWork(scenario: Scenario): Promise<ReleaseHandlerDeps> {
    const { code, deps } = await runScenario(scenario);

    assert.strictEqual(code, 0);
    assert.deepStrictEqual(readFirstLogArgs(deps), [noReleaseMessage]);
    return deps;
}

async function assertFailureLog(scenario: Scenario, expected: RegExp): Promise<ReleaseHandlerDeps> {
    const { code, deps } = await runScenario(scenario);

    assert.strictEqual(code, 1);
    assert.strictEqual((deps.log as SinonSpy).callCount, 1);
    assert.match(String(readFirstLogArgs(deps)[0]), expected);
    return deps;
}

async function assertCurrentHeadRetryTag(flags: Partial<ReleaseFlags>): Promise<void> {
    const order: string[] = [];
    const buildAndPublishAll = fake();
    const { code, deps } = await runScenario({
        order,
        buildAndPublishAll,
        flags,
        planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
    });

    assert.strictEqual(code, 0);
    assert.strictEqual(buildAndPublishAll.callCount, 0);
    assert.deepStrictEqual((deps.log as SinonSpy).lastCall.args, ['Release completed.']);
    assert.deepStrictEqual(order, ['plan', 'clean', 'head', 'tag:pkg-a@1.0.1']);
}

suite('release-handler', function () {
    test('prints the computed release plan when no action flags are set', async function () {
        const deps = createReleaseHandlerDeps();

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 0);
        assert.match(String((deps.log as SinonSpy).firstCall.args[0]), /Release plan:\n- pkg-a/u);
    });

    test('prints unpublished packages in the computed release plan', async function () {
        const deps = createReleaseHandlerDeps({
            planOutcomes: [
                createReleasePlanOutcome([
                    createReleasePackage({
                        previousVersion: undefined,
                        artifactState: 'first-publish',
                        latestRegistryMetadata: undefined
                    })
                ])
            ]
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 0);
        assert.match(String((deps.log as SinonSpy).firstCall.args[0]), /unpublished -> 1\.0\.1/u);
    });

    test('rejects invalid flag combinations before planning', async function () {
        await assertFlagError({ commit: true, noDryRun: true }, '--commit requires --write-changelog');
    });

    test('prints multiple invalid flag combinations on separate lines', async function () {
        await assertFlagError(
            { writeChangelog: true, publish: true, push: true, noDryRun: true },
            '--write-changelog --publish requires --commit\n--push requires --commit or --tag'
        );
    });

    test('requires --no-dry-run for release writes', async function () {
        await assertFlagError({ publish: true }, 'Release writes require --no-dry-run');
    });

    test('rejects changelog publish without commit before planning', async function () {
        await assertFlagError(
            { writeChangelog: true, publish: true, noDryRun: true },
            '--write-changelog --publish requires --commit'
        );
    });

    test('rejects push without commit or tag before planning', async function () {
        await assertFlagError({ push: true, noDryRun: true }, '--push requires --commit or --tag');
    });

    test('rejects GitHub release without tag and push before planning', async function () {
        await assertFlagError({ githubRelease: true, noDryRun: true }, '--github-release requires --tag --push');
    });

    test('rejects GitHub release with tag but without push before planning', async function () {
        await assertFlagError(
            { tag: true, githubRelease: true, noDryRun: true },
            '--github-release requires --tag --push'
        );
    });

    test('rejects GitHub release with push but without tag before planning', async function () {
        await assertFlagError(
            { push: true, githubRelease: true, noDryRun: true },
            '--push requires --commit or --tag\n--github-release requires --tag --push'
        );
    });

    test('prints no-op release plans without release targets', async function () {
        await assertNoReleaseWork({
            planOutcomes: createReleasePlanOutcomesForPackage(
                createReleasePackage({ changed: false, artifactState: 'unchanged' })
            )
        });
    });

    test('does not treat missing current Git head as retry release work', async function () {
        await assertNoReleaseWork({
            flags: { tag: true, noDryRun: true },
            planOutcomes: createReleasePlanOutcomesForPackage(
                createCurrentHeadRetryPackage({
                    currentGitHead: undefined,
                    latestRegistryMetadata: {
                        version: '1.0.1',
                        publishedAt: undefined,
                        gitHead: undefined
                    }
                })
            )
        });
    });

    test('does not treat missing registry metadata as retry release work', async function () {
        await assertNoReleaseWork({
            flags: { tag: true, noDryRun: true },
            planOutcomes: createReleasePlanOutcomesForPackage(
                createCurrentHeadRetryPackage({
                    latestRegistryMetadata: undefined
                })
            )
        });
    });

    test('prints no-op release results when action flags have no release work', async function () {
        await assertNoReleaseWork({
            flags: { publish: true, noDryRun: true },
            planOutcomes: createReleasePlanOutcomesForPackage(
                createCurrentHeadRetryPackage({
                    latestRegistryMetadata: {
                        version: '1.0.1',
                        publishedAt: undefined,
                        gitHead: 'old-head'
                    }
                })
            )
        });
    });

    test('prints no-op release results for publish-only current-head retry packages', async function () {
        const order: string[] = [];

        await assertNoReleaseWork({
            order,
            flags: { publish: true, noDryRun: true },
            planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
        });

        assert.deepStrictEqual(order, ['plan']);
    });

    test('returns 1 when release planning fails', async function () {
        await assertFailureLog({ planOutcomes: [createReleasePlanFailureOutcome()] }, /Configuration issues/u);
    });

    test('rejects tagging changed packages without publishing', async function () {
        await assertFailureLog({ flags: { tag: true, noDryRun: true } }, /--tag requires --publish/u);
    });

    test('returns 1 when publish fails', async function () {
        const buildAndPublishAll = fake.resolves({
            result: Result.err({ type: 'config', issues: ['publish failed'] }),
            getReport() {
                return undefined;
            }
        });
        const deps = createReleaseHandlerDeps({
            flags: { publish: true, noDryRun: true },
            buildAndPublishAll
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 1);
        assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], {
            dryRun: false,
            stage: false,
            collectReport: false
        });
        assert.match(String((deps.log as SinonSpy).firstCall.args[0]), /publish failed/u);
    });

    test('prints publish partial failures as non-staged failures', async function () {
        const deps = createReleaseHandlerDeps({
            flags: { publish: true, noDryRun: true },
            buildAndPublishAll: fake.resolves({
                result: Result.err({
                    type: 'partial',
                    succeeded: [
                        {
                            bundle: { name: 'pkg-a', version: '1.0.1' },
                            publication: { type: 'staged', stageId: 'stage-a' }
                        }
                    ],
                    failures: [new Error('publish failed')]
                }),
                getReport() {
                    return undefined;
                }
            })
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 1);
        assert.strictEqual((deps.log as SinonSpy).callCount, 1);
        assert.match(String((deps.log as SinonSpy).firstCall.args[0]), /publish failed/u);
        assert.doesNotMatch(String((deps.log as SinonSpy).firstCall.args[0]), /Staged packages/u);
    });

    test('ignores publish results outside the final release plan', async function () {
        const order: string[] = [];
        const deps = createReleaseHandlerDeps({
            order,
            flags: { publish: true, tag: true, noDryRun: true },
            buildAndPublishAll: fake.resolves({
                result: Result.ok([{ bundle: { name: 'pkg-b', version: '1.0.0' } }]),
                getReport() {
                    return undefined;
                }
            })
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(order, ['plan', 'clean', 'head']);
    });

    test('rejects GitHub releases without a GitHub token', async function () {
        await assertFailureLog(
            {
                flags: githubReleaseFlags,
                readEnvironmentVariable: () => {
                    return undefined;
                },
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            },
            /GH_TOKEN or GITHUB_TOKEN/u
        );
    });

    test('rejects GitHub releases when package metadata is not a GitHub repository', async function () {
        await assertFailureLog(
            {
                flags: githubReleaseFlags,
                readPackageInfo: async () => {
                    return { repository: { url: 'https://example.com/owner/repo' } };
                },
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            },
            /package\.json repository/u
        );
    });

    test('rejects GitHub repositories with extra path segments', async function () {
        await assertFailureLog(
            {
                flags: githubReleaseFlags,
                readPackageInfo: async () => {
                    return { repository: { url: 'https://github.com/enormora/packtory/extra' } };
                },
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            },
            /package\.json repository/u
        );
    });

    test('rejects GitHub repositories with non-URL prefixes', async function () {
        await assertFailureLog(
            {
                flags: githubReleaseFlags,
                readPackageInfo: async () => {
                    return { repository: { url: 'prefixhttps://github.com/enormora/packtory' } };
                },
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            },
            /package\.json repository/u
        );
    });

    test('rejects changelog generation when the config cannot be parsed', async function () {
        await assertFailureLog(
            {
                config: { packages: [] },
                flags: { writeChangelog: true, noDryRun: true }
            },
            /invalid for changelog generation/u
        );
    });

    test('rejects GitHub release notes when the config cannot be parsed', async function () {
        await assertFailureLog(
            {
                config: { packages: [] },
                flags: githubReleaseFlags,
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            },
            /invalid for changelog generation/u
        );
    });

    test('writes changelogs without committing when only --write-changelog is set', async function () {
        const order: string[] = [];
        const deps = createReleaseHandlerDeps({ order, flags: { writeChangelog: true, noDryRun: true } });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(order, ['plan', 'clean']);
    });

    test('returns 1 when the post-commit release plan fails', async function () {
        await assertFailureLog(
            {
                flags: { writeChangelog: true, commit: true, publish: true, noDryRun: true },
                planOutcomes: [createReleasePlanOutcome([createReleasePackage()]), createReleasePlanFailureOutcome()]
            },
            /Configuration issues/u
        );
    });

    test('returns 1 when loading config throws', async function () {
        const deps = createReleaseHandlerDeps({
            configLoader: { load: fake.rejects(new Error('load failed')) } as unknown as ConfigLoader
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 1);
        assert.deepStrictEqual((deps.log as SinonSpy).firstCall.args, ['load failed']);
    });

    test('returns 1 when loading config throws a non-error value', async function () {
        const deps = createReleaseHandlerDeps({
            configLoader: {
                async load() {
                    await Promise.reject('string failure' as unknown as Error);
                }
            } as unknown as ConfigLoader
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 1);
        assert.deepStrictEqual((deps.log as SinonSpy).firstCall.args, ['string failure']);
    });

    test('writes changelog, commits, replans, publishes, tags, pushes, and creates GitHub releases in order', async function () {
        const order: string[] = [];
        const deps = createReleaseHandlerDeps({
            order,
            flags: {
                writeChangelog: true,
                commit: true,
                publish: true,
                tag: true,
                push: true,
                githubRelease: true,
                noDryRun: true
            },
            planOutcomes: [
                createReleasePlanOutcome([createReleasePackage({ nextVersion: '1.0.1' })]),
                createReleasePlanOutcome([createReleasePackage({ nextVersion: '1.0.2' })])
            ],
            buildAndPublishAll: createPublishVersionSpy(order, '1.0.2')
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 0);
        assert.deepStrictEqual((deps.log as SinonSpy).lastCall.args, ['Release completed.']);
        assert.deepStrictEqual(order, [
            'plan',
            'clean',
            'commit:/repo/CHANGELOG.md:Release packages',
            'plan',
            'publish',
            'head',
            'tag:pkg-a@1.0.2',
            'push',
            'github-release'
        ]);
    });

    test('tags current-head registry packages without publishing during retries', async function () {
        await assertCurrentHeadRetryTag({ tag: true, noDryRun: true });
    });

    test('skips publish for current-head retry packages when --publish --tag is used', async function () {
        await assertCurrentHeadRetryTag({ publish: true, tag: true, noDryRun: true });
    });

    test('creates GitHub releases with empty notes for current-head retry packages', async function () {
        const createReleaseIfMissing = fake.resolves('created');
        const createGitHubReleaseClient = fake(() => {
            return { createReleaseIfMissing };
        });

        const code = await runReleaseHandler(
            createReleaseHandlerDeps({
                createGitHubReleaseClient,
                flags: githubReleaseFlags,
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            })
        );

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(createGitHubReleaseClient.firstCall.args, [
            { owner: 'enormora', repo: 'packtory', token: 'gh-token' }
        ]);
        assert.deepStrictEqual(createReleaseIfMissing.firstCall.args, [
            { tagName: 'pkg-a@1.0.1', name: 'pkg-a@1.0.1', body: '' }
        ]);
    });

    test('uses GITHUB_TOKEN when GH_TOKEN is not set', async function () {
        const createGitHubReleaseClient = fake(() => {
            return { createReleaseIfMissing: fake.resolves('created') };
        });

        const code = await runReleaseHandler(
            createReleaseHandlerDeps({
                createGitHubReleaseClient,
                readEnvironmentVariable(name) {
                    return name === 'GITHUB_TOKEN' ? 'github-token' : undefined;
                },
                flags: githubReleaseFlags,
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            })
        );

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(createGitHubReleaseClient.firstCall.args, [
            { owner: 'enormora', repo: 'packtory', token: 'github-token' }
        ]);
    });
});
