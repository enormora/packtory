import assert from 'node:assert';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type {
    CollectMergedPullRequestsOptions,
    FilterPullRequestsByTargetFilesInput,
    PrLogEngine,
    PrLogEngineOptions,
    ReadPullRequestChangedFilesOptions,
    ResolvePullRequestLabelsOptions,
    UpdateChangelogInput
} from '@pr-log/core';
import type { Packtory, ReleasePlanOutcome, ReleasePlanPackage } from '../packtory/packtory.ts';
import type { ConfigLoader } from '../command-line-interface/config-loader.ts';
import { runReleaseHandler, type ReleaseHandlerDeps } from '../command-line-interface/runner/release-handler.ts';
import { createFakeFileManager, type FakeFileManager } from './fake-file-manager.ts';

export type ReleaseFlags = ReleaseHandlerDeps['flags'];
type PacktoryFixture = Packtory & {
    readonly planReleaseAgainstLatestPublished: SinonSpy;
};
export type ReleaseStepRecorder = (step: string) => void;
type ReleaseStepRecorderFixture = {
    readonly recordReleaseStep: ReleaseStepRecorder;
    readonly releaseSteps: readonly string[];
};
export type ReleaseHandlerDepsFixture = {
    readonly createGitHubReleaseClient: ReleaseHandlerDeps['createGitHubReleaseClient'];
    readonly createPrLogEngine: ReleaseHandlerDeps['createPrLogEngine'];
    readonly currentDate: ReleaseHandlerDeps['currentDate'];
    readonly fileManager: FakeFileManager;
    readonly flags: ReleaseFlags;
    readonly gitClient: ReleaseHandlerDeps['gitClient'];
    readonly log: SinonSpy;
    readonly packtory: PacktoryFixture;
    readonly releaseSteps: readonly string[];
    readonly readEnvironmentVariable: ReleaseHandlerDeps['readEnvironmentVariable'];
    readonly readPackageInfo: ReleaseHandlerDeps['readPackageInfo'];
    readonly spinnerRenderer: ReleaseHandlerDeps['spinnerRenderer'];
    readonly configLoader: ReleaseHandlerDeps['configLoader'];
    readonly workingDirectory: string;
};

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
        outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ]
    }
} as const;

export function createReleasePackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return {
        name: 'pkg-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: 'substantive',
        changed: true,
        previousGitHead: 'old-head',
        currentGitHead: 'new-head',
        latestRegistryMetadata: { version: '1.0.0', publishedAt: undefined, gitHead: 'old-head' },
        artifactFiles: [ 'index.js' ],
        changedArtifactFiles: [ 'index.js' ],
        sourceFiles: [ 'source/pkg-a.ts' ],
        changelogSourceFiles: [ 'source/pkg-a.ts' ],
        changelogDependencyNames: [],
        ...overrides
    };
}

export function createCurrentHeadRetryPackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
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

export function createReleasePlanOutcome(packages: readonly ReleasePlanPackage[]): ReleasePlanOutcome {
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

export function createReleasePlanOutcomesForPackage(packagePlan: ReleasePlanPackage): readonly ReleasePlanOutcome[] {
    return [ createReleasePlanOutcome([ packagePlan ]) ];
}

export function createPublishVersionSpy(recordReleaseStep: ReleaseStepRecorder, version: string): SinonSpy {
    return fake(async function () {
        recordReleaseStep('publish');
        return {
            result: Result.ok([ { bundle: { name: 'pkg-a', version } } ]),
            getReport() {
                return undefined;
            }
        };
    });
}

export function createEngine(): PrLogEngine {
    const engine: PrLogEngine = {
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest-semver' }),
        resolveChangelogBaseRef: fake.resolves({ ref: 'old-head' }),
        collectMergedPullRequests: fake(async function (input: CollectMergedPullRequestsOptions) {
            assert.strictEqual(input.githubRepo, 'enormora/packtory');
            return [ { id: 1, title: 'Fix package' } ];
        }),
        readPullRequestChangedFiles: fake(async function (input: ReadPullRequestChangedFilesOptions) {
            assert.strictEqual(input.githubRepo, 'enormora/packtory');
            return new Map([ [ 1, [ 'source/pkg-a.ts' ] ] ]);
        }),
        readPullRequestLabels: fake.resolves(new Map([ [ 1, [ 'bug' ] ] ])),
        filterPullRequestsByTargetFiles: fake(function (input: FilterPullRequestsByTargetFilesInput) {
            return input.pullRequests;
        }),
        resolvePullRequestLabels: fake(async function (input: ResolvePullRequestLabelsOptions) {
            assert.strictEqual(input.githubRepo, 'enormora/packtory');
            return [ { id: 1, title: 'Fix package', label: 'bug' } ];
        }),
        renderGroupedTargetChangelog: fake.returns('## pkg-a 1.0.1\n'),
        renderTargetChangelog: fake.returns('## pkg-a 1.0.1\n'),
        updateChangelog: fake(function (input: UpdateChangelogInput) {
            return input.generatedChangelogMarkdown;
        }),
        renderChangelog: fake.returns('')
    };
    return engine;
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
const unattributedPackageChangelogMessage =
    'No changelog files were written; changelog attribution found no pull requests for pkg-a.';

type PackageChangelogConfig = {
    readonly packages: typeof validConfig.packages;
    readonly changelog: {
        readonly outputs: readonly [{ readonly kind: 'package-file'; readonly path: 'CHANGELOG.md'; }];
    };
};

export function createReleaseStepRecorder(): ReleaseStepRecorderFixture {
    const releaseSteps: string[] = [];
    return {
        recordReleaseStep(step) {
            releaseSteps.push(step);
        },
        releaseSteps
    };
}

function createPackageChangelogConfig(): PackageChangelogConfig {
    return {
        ...validConfig,
        changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] }
    };
}

export function createTwoPackageChangelogConfig(): unknown {
    return {
        ...createPackageChangelogConfig(),
        packages: [
            validConfig.packages[0],
            {
                sourcesFolder: 'src/pkg-b',
                mainPackageJson: { type: 'module' },
                name: 'pkg-b',
                roots: { main: { js: 'index.js' } },
                publishSettings: { access: 'public' }
            }
        ]
    };
}

export function createConfigWithoutChangelogOutputs(): unknown {
    return {
        ...validConfig,
        changelog: {}
    };
}

export function createEngineWithoutAttributedPullRequests(): PrLogEngine {
    return {
        ...createEngine(),
        resolvePullRequestLabels: fake.resolves([])
    };
}

export type Scenario = {
    readonly buildAndPublishAll?: SinonSpy;
    readonly config?: unknown;
    readonly configLoader?: ConfigLoader;
    readonly createGitHubReleaseClient?: SinonSpy;
    readonly engine?: PrLogEngine;
    readonly flags?: Partial<ReleaseFlags>;
    readonly readEnvironmentVariable?: (name: 'GH_TOKEN' | 'GITHUB_TOKEN') => string | undefined;
    readonly readPackageInfo?: () => Promise<Readonly<Record<string, unknown>>>;
    readonly recordReleaseStep?: ReleaseStepRecorder;
    readonly planOutcomes?: readonly ReleasePlanOutcome[];
};

export function createReleasePlanFailureOutcome(): ReleasePlanOutcome {
    return {
        result: Result.err({ type: 'config', issues: [ 'bad config' ] }),
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

function createGitHubReleaseClientFactory(
    scenario: Scenario,
    recordReleaseStep: ReleaseStepRecorder
): ReleaseHandlerDeps['createGitHubReleaseClient'] {
    return scenario.createGitHubReleaseClient ??
        fake(function () {
            return {
                async createReleaseIfMissing() {
                    recordReleaseStep('github-release');
                    return 'created' as const;
                }
            };
        });
}

function createPlanReleaseSpy(
    recordReleaseStep: ReleaseStepRecorder,
    planOutcomes: readonly ReleasePlanOutcome[]
): SinonSpy {
    let planCallCount = 0;
    return fake(async function () {
        recordReleaseStep('plan');
        const outcome = planOutcomes[planCallCount] ?? planOutcomes.at(-1);
        if (outcome === undefined) {
            assert.fail('expected at least one release plan outcome');
        }
        planCallCount += 1;
        return outcome;
    });
}

function createReleaseGitClient(recordReleaseStep: ReleaseStepRecorder): ReleaseHandlerDeps['gitClient'] {
    return {
        async commit(filePaths, message) {
            recordReleaseStep(`commit:${filePaths.join(',')}:${message}`);
        },
        async currentHead() {
            recordReleaseStep('head');
            return 'new-head';
        },
        async deleteRemoteBranch() {
            recordReleaseStep('delete-branch');
        },
        async ensureClean() {
            recordReleaseStep('clean');
        },
        async ensureTag(tagName) {
            recordReleaseStep(`tag:${tagName}`);
        },
        async pushHeadToBranch() {
            recordReleaseStep('push-branch');
        },
        async pushFollowTags() {
            recordReleaseStep('push');
        }
    };
}

function createPacktoryFixture(
    scenario: Scenario,
    recordReleaseStep: ReleaseStepRecorder,
    planReleaseAgainstLatestPublished: SinonSpy
): PacktoryFixture {
    return {
        analyzeReleaseAgainstLatestPublished: fake.rejects(new Error('unused release analysis')),
        buildAndPublishAll: scenario.buildAndPublishAll ??
            fake(async function () {
                recordReleaseStep('publish');
                return {
                    result: Result.ok([ { bundle: { name: 'pkg-a', version: '1.0.1' } } ]),
                    getReport() {
                        return undefined;
                    }
                };
            }),
        diffAgainstLatestPublished: fake.rejects(new Error('unused release diff')),
        planReleaseAgainstLatestPublished,
        resolveAndLinkAll: fake.rejects(new Error('unused resolve and link')),
        packPackage: fake.rejects(new Error('unused pack'))
    };
}

function readEnvironmentVariable(scenario: Scenario): ReleaseHandlerDeps['readEnvironmentVariable'] {
    return function (name) {
        if (scenario.readEnvironmentVariable !== undefined) {
            return scenario.readEnvironmentVariable(name);
        }
        return name === 'GH_TOKEN' ? 'gh-token' : undefined;
    };
}

function createConfigLoader(scenario: Scenario): ConfigLoader {
    return scenario.configLoader ?? { load: fake.resolves(scenario.config ?? validConfig) };
}

export function createReleaseHandlerDeps(scenario: Scenario = {}): ReleaseHandlerDepsFixture {
    const releaseSteps: string[] = [];
    const recordReleaseStep = scenario.recordReleaseStep ??
        function (step: string) {
            releaseSteps.push(step);
        };
    const planOutcomes = scenario.planOutcomes ?? [ createReleasePlanOutcome([ createReleasePackage() ]) ];
    const stopAll = fake();
    const planReleaseAgainstLatestPublished = createPlanReleaseSpy(recordReleaseStep, planOutcomes);
    return {
        createGitHubReleaseClient: createGitHubReleaseClientFactory(scenario, recordReleaseStep),
        createPrLogEngine(options: Readonly<PrLogEngineOptions>) {
            if (scenario.readEnvironmentVariable === undefined) {
                assert.strictEqual(options.githubToken, 'gh-token');
            }
            return scenario.engine ?? createEngine();
        },
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        fileManager: createFakeFileManager(),
        flags: { ...defaultFlags, ...scenario.flags },
        gitClient: createReleaseGitClient(recordReleaseStep),
        log: fake(),
        packtory: createPacktoryFixture(scenario, recordReleaseStep, planReleaseAgainstLatestPublished),
        releaseSteps,
        readEnvironmentVariable: readEnvironmentVariable(scenario),
        readPackageInfo: scenario.readPackageInfo ??
            async function () {
                return { repository: { url: 'https://github.com/enormora/packtory' } };
            },
        spinnerRenderer: {
            stopAll() {
                stopAll();
            }
        },
        configLoader: createConfigLoader(scenario),
        workingDirectory: '/repo'
    };
}

export function createPackageChangelogDeps(
    recordReleaseStep: ReleaseStepRecorder,
    flags: Partial<ReleaseFlags>,
    engine: PrLogEngine
): ReleaseHandlerDepsFixture {
    return createReleaseHandlerDeps({
        recordReleaseStep,
        engine,
        flags,
        config: createPackageChangelogConfig()
    });
}

async function runScenario(scenario: Scenario): Promise<{
    readonly code: number;
    readonly deps: ReleaseHandlerDepsFixture;
}> {
    const deps = createReleaseHandlerDeps(scenario);
    return { code: await runReleaseHandler(deps), deps };
}

function readFirstLogArgs(deps: ReleaseHandlerDepsFixture): readonly unknown[] {
    return deps.log.firstCall.args;
}

export async function assertCleanChangelogNoOp(
    deps: ReleaseHandlerDepsFixture,
    order: readonly string[],
    expectedMessage: string
): Promise<void> {
    const code = await runReleaseHandler(deps);

    assert.strictEqual(code, 0);
    assert.deepStrictEqual(order, [ 'plan', 'clean' ]);
    assert.deepStrictEqual(readFirstLogArgs(deps), [ expectedMessage ]);
}

export async function assertFlagError(flags: Partial<ReleaseFlags>, expected: string): Promise<ReleaseHandlerDeps> {
    const { code, deps } = await runScenario({ flags });

    assert.strictEqual(code, 1);
    assert.strictEqual(deps.packtory.planReleaseAgainstLatestPublished.callCount, 0);
    assert.deepStrictEqual(readFirstLogArgs(deps), [ expected ]);
    return deps;
}

export async function assertNoReleaseWork(scenario: Scenario): Promise<ReleaseHandlerDepsFixture> {
    const { code, deps } = await runScenario(scenario);

    assert.strictEqual(code, 0);
    assert.deepStrictEqual(readFirstLogArgs(deps), [ noReleaseMessage ]);
    return deps;
}

export async function assertFailureLog(scenario: Scenario, expected: RegExp): Promise<ReleaseHandlerDeps> {
    const { code, deps } = await runScenario(scenario);

    assert.strictEqual(code, 1);
    assert.strictEqual(deps.log.callCount, 1);
    assert.match(String(readFirstLogArgs(deps)[0]), expected);
    return deps;
}

export async function assertCurrentHeadRetryTag(flags: Partial<ReleaseFlags>): Promise<void> {
    const buildAndPublishAll = fake();
    const { code, deps } = await runScenario({
        buildAndPublishAll,
        flags,
        planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
    });

    assert.strictEqual(code, 0);
    assert.strictEqual(buildAndPublishAll.callCount, 0);
    assert.deepStrictEqual(deps.log.lastCall.args, [ 'Release completed.' ]);
    assert.deepStrictEqual(deps.releaseSteps, [ 'plan', 'clean', 'head', 'tag:pkg-a@1.0.1' ]);
}

export { githubReleaseFlags, unattributedPackageChangelogMessage, validConfig };
