import assert from 'node:assert';
import type { PrLogEngine, PrLogEngineOptions, PullRequest, PullRequestWithLabel } from '@pr-log/core';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type { Packtory, ReleasePlanPackage, ReleasePlanResult } from '../../packtory/packtory.ts';
import { createFakeFileManager, type FakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import {
    loadPlannedRelease,
    prepareReleaseChangelogs,
    type PlannedRelease,
    type ReleasePreparationDeps
} from './release-preparation.ts';

type EngineSpec = {
    readonly pullRequests: readonly PullRequest[];
    readonly labeledPullRequests: readonly PullRequestWithLabel[];
    readonly renderedMarkdown: string;
};

type ChangelogUpdateInput = {
    readonly generatedChangelogMarkdown: string;
};
type PullRequestFilterInput = {
    readonly targetName: string;
    readonly pullRequests: readonly PullRequest[];
};
type PullRequestLabelInput = {
    readonly pullRequests: readonly PullRequest[];
};

type DependencySpec = {
    readonly createPrLogEngine: SinonSpy;
    readonly fileManager: FakeFileManager;
    readonly log: SinonSpy;
    readonly packtory: Packtory;
    readonly readEnvironmentVariable: ReleasePreparationDeps['readEnvironmentVariable'];
    readonly stopAll: SinonSpy;
};

type CreatedReleasePreparationDeps = ReleasePreparationDeps & {
    readonly createPrLogEngine: SinonSpy;
    readonly fileManager: FakeFileManager;
    readonly log: SinonSpy;
    readonly stopAll: SinonSpy;
};

const validConfig = {
    changelog: { outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ] },
    packages: [
        {
            sourcesFolder: 'src/pkg-a',
            mainPackageJson: { type: 'module' },
            name: 'pkg-a',
            roots: { main: { js: 'index.js' } },
            publishSettings: { access: 'public' }
        }
    ]
} as const;

function createReleasePackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return {
        name: 'pkg-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: 'substantive',
        changed: true,
        previousGitHead: 'old-head',
        currentGitHead: 'new-head',
        latestRegistryMetadata: undefined,
        artifactFiles: [ 'index.js' ],
        changedArtifactFiles: [ 'index.js' ],
        sourceFiles: [ 'src/pkg-a/index.ts' ],
        changelogDependencyNames: [],
        changelogDependencyUpdates: [],
        changelogSourceFiles: [ 'src/pkg-a/index.ts' ],
        ...overrides
    };
}

function createEngine(spec: EngineSpec): PrLogEngine {
    return {
        collectMergedPullRequests: fake.resolves(spec.pullRequests),
        filterPullRequestsByTargetFiles: fake(function () {
            return spec.pullRequests;
        }),
        readPullRequestChangedFiles: fake.resolves(new Map([ [ 1, [ 'src/pkg-a/index.ts' ] ] ])),
        readPullRequestLabels: fake.resolves(new Map([ [ 1, [ 'bug' ] ] ])),
        renderChangelog: fake.returns(''),
        renderGroupedTargetChangelog: fake.returns(spec.renderedMarkdown),
        renderTargetChangelog: fake.returns(spec.renderedMarkdown),
        resolveChangelogBaseRef: fake.resolves({ ref: 'old-head' }),
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest-semver' }),
        resolvePullRequestLabels: fake.resolves(spec.labeledPullRequests),
        resolveVersionNumber: fake.returns('1.0.1'),
        updateChangelog: fake(function (input: ChangelogUpdateInput) {
            return `updated:\n${input.generatedChangelogMarkdown}`;
        })
    };
}

function createPacktory(result: ReleasePlanResult): Packtory {
    async function unusedPacktoryMethod(): Promise<never> {
        throw new Error('unused packtory method');
    }

    return {
        analyzeReleaseAgainstLatestPublished: unusedPacktoryMethod,
        buildAndPublishAll: unusedPacktoryMethod,
        diffAgainstLatestPublished: unusedPacktoryMethod,
        packPackage: unusedPacktoryMethod,
        planReleaseAgainstLatestPublished: fake.resolves({
            result,
            getReport() {
                return createBuildReportFixture();
            }
        }),
        resolveAndLinkAll: unusedPacktoryMethod
    };
}

function createDefaultEngine(): PrLogEngine {
    return createEngine({
        labeledPullRequests: [ { id: 1, label: 'bug', title: 'Fix package' } ],
        pullRequests: [ { id: 1, title: 'Fix package' } ],
        renderedMarkdown: '## pkg-a 1.0.1\n'
    });
}

function readDefaultEnvironmentVariable(name: 'GH_TOKEN' | 'GITHUB_TOKEN'): string | undefined {
    return name === 'GH_TOKEN' ? 'gh-token' : undefined;
}

function createDefaultDependencySpec(): DependencySpec {
    return {
        createPrLogEngine: fake.returns(createDefaultEngine()),
        fileManager: createFakeFileManager(),
        log: fake(),
        packtory: createPacktory(Result.ok({ packages: [ createReleasePackage() ] })),
        readEnvironmentVariable: readDefaultEnvironmentVariable,
        stopAll: fake()
    };
}

function mergeDependencySpec(overrides: Partial<DependencySpec>): DependencySpec {
    return { ...createDefaultDependencySpec(), ...overrides };
}

function createDependencies(overrides: Partial<DependencySpec> = {}): CreatedReleasePreparationDeps {
    const spec = mergeDependencySpec(overrides);

    return {
        createPrLogEngine: spec.createPrLogEngine,
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        fileManager: spec.fileManager,
        log: spec.log,
        packtory: spec.packtory,
        readEnvironmentVariable: spec.readEnvironmentVariable,
        async readPackageInfo() {
            return { repository: { url: 'https://github.com/owner/repo' } };
        },
        spinnerRenderer: {
            stopAll() {
                spec.stopAll();
            }
        },
        configLoader: { load: fake.resolves(validConfig) },
        workingDirectory: '/repo',
        stopAll: spec.stopAll
    };
}

function plannedRelease(packages: readonly ReleasePlanPackage[] = [ createReleasePackage() ]): PlannedRelease {
    return { config: validConfig, packages };
}

function createEmptyChangelogDependencies(): CreatedReleasePreparationDeps {
    return createDependencies({
        createPrLogEngine: fake.returns(createEngine({
            labeledPullRequests: [],
            pullRequests: [],
            renderedMarkdown: ''
        }))
    });
}

suite('release-preparation', function () {
    test('loads a planned release and stops spinners after planning', async function () {
        const deps = createDependencies();

        assert.deepStrictEqual(await loadPlannedRelease(deps), plannedRelease());
        assert.strictEqual(deps.stopAll.callCount, 1);
    });

    test('logs release plan failures without returning a planned release', async function () {
        const deps = createDependencies({
            packtory: createPacktory(Result.err({ type: 'config', issues: [ 'bad config' ] }))
        });

        assert.strictEqual(await loadPlannedRelease(deps), undefined);
        assert.deepStrictEqual(deps.log.firstCall.args, [
            'Configuration issues, there are 1 issue(s)\n\n- bad config'
        ]);
    });

    test('uses GITHUB_TOKEN for changelog generation when GH_TOKEN is absent', async function () {
        const createPrLogEngine = fake(function (options: Readonly<PrLogEngineOptions>) {
            assert.partialDeepStrictEqual(options, {
                githubToken: 'github-token',
                workingDirectory: '/repo'
            });
            return createEngine({
                labeledPullRequests: [ { id: 1, label: 'bug', title: 'Fix package' } ],
                pullRequests: [ { id: 1, title: 'Fix package' } ],
                renderedMarkdown: '## pkg-a 1.0.1\n'
            });
        });
        const deps = createDependencies({
            createPrLogEngine,
            readEnvironmentVariable(name) {
                return name === 'GITHUB_TOKEN' ? 'github-token' : undefined;
            }
        });

        const { changelog } = await prepareReleaseChangelogs(deps, plannedRelease(), true);

        assert.strictEqual(changelog.changelog.groupedMarkdown, '## pkg-a 1.0.1\n');
        assert.strictEqual(createPrLogEngine.callCount, 1);
    });

    test('prefers GH_TOKEN over GITHUB_TOKEN for changelog generation', async function () {
        const createPrLogEngine = fake(function (options: Readonly<PrLogEngineOptions>) {
            assert.strictEqual(options.githubToken, 'gh-token');
            return createDefaultEngine();
        });
        const deps = createDependencies({
            createPrLogEngine,
            readEnvironmentVariable(name) {
                return name === 'GH_TOKEN' ? 'gh-token' : 'github-token';
            }
        });

        await prepareReleaseChangelogs(deps, plannedRelease(), true);

        assert.strictEqual(createPrLogEngine.callCount, 1);
    });

    test('rejects invalid changelog config before creating pr-log', async function () {
        const deps = createDependencies();

        await assert.rejects(
            prepareReleaseChangelogs(deps, { config: {}, packages: [ createReleasePackage() ] }, true),
            /The loaded config is invalid for changelog generation/u
        );
        assert.strictEqual(deps.createPrLogEngine.callCount, 0);
    });

    test('prepares configured changelog files and returns their paths', async function () {
        const deps = createDependencies();

        const { writtenFiles, writtenPaths } = await prepareReleaseChangelogs(deps, plannedRelease(), true);

        assert.deepStrictEqual(writtenPaths, [ '/repo/CHANGELOG.md' ]);
        assert.deepStrictEqual(writtenFiles, [
            { content: 'updated:\n## pkg-a 1.0.1\n', filePath: '/repo/CHANGELOG.md' }
        ]);
        assert.deepStrictEqual(deps.fileManager.getAllWriteFileCalls(), []);
    });

    test('logs unchanged plans when no changelog files are written', async function () {
        const deps = createEmptyChangelogDependencies();

        const result = await prepareReleaseChangelogs(
            deps,
            plannedRelease([ createReleasePackage({ changed: false }) ]),
            false
        );

        assert.deepStrictEqual(result.writtenPaths, []);
        assert.deepStrictEqual(deps.log.firstCall.args, [ 'No changelog files were written.' ]);
    });

    test('reports packages without changelog entries when changelog files are optional', async function () {
        const deps = createEmptyChangelogDependencies();

        const result = await prepareReleaseChangelogs(
            deps,
            plannedRelease([
                createReleasePackage(),
                createReleasePackage({ name: 'pkg-b', changelogSourceFiles: [ 'src/pkg-b/index.ts' ] })
            ]),
            false
        );

        assert.deepStrictEqual(result.writtenPaths, []);
        assert.deepStrictEqual(deps.log.firstCall.args, [
            'No changelog files were written; changelog attribution found no pull requests for pkg-a, pkg-b.'
        ]);
    });

    test('reports only changed packages without changelog entries', async function () {
        const pullRequests: readonly PullRequest[] = [ { id: 1, title: 'Fix package' } ];
        const engine = {
            ...createEngine({
                labeledPullRequests: [ { id: 1, label: 'bug', title: 'Fix package' } ],
                pullRequests,
                renderedMarkdown: '## pkg-a 1.0.1\n'
            }),
            filterPullRequestsByTargetFiles: fake(function (input: PullRequestFilterInput) {
                return input.targetName === 'pkg-a' ? input.pullRequests : [];
            }),
            resolvePullRequestLabels: fake(async function (input: PullRequestLabelInput) {
                return input.pullRequests.map(function (pullRequest) {
                    return { id: pullRequest.id, label: 'bug', title: pullRequest.title };
                });
            })
        };
        const deps = createDependencies({
            createPrLogEngine: fake.returns(engine)
        });

        const result = await prepareReleaseChangelogs(
            deps,
            plannedRelease([
                createReleasePackage(),
                createReleasePackage({ name: 'pkg-b', changelogSourceFiles: [ 'src/pkg-b/index.ts' ] })
            ]),
            true
        );

        assert.deepStrictEqual(result.changelog.changelog.packageNamesWithoutChangelogEntries, [ 'pkg-b' ]);
    });

    test('rejects required changelog generation when no files are written', async function () {
        const deps = createEmptyChangelogDependencies();

        await assert.rejects(
            prepareReleaseChangelogs(deps, plannedRelease(), true),
            /No changelog files were written; changelog attribution found no pull requests for pkg-a\./u
        );
        assert.deepStrictEqual(deps.log.getCalls(), []);
    });
});
