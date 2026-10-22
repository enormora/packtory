import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type {
    PullRequestLogEngine,
    PullRequestLogEngineOptions,
    PullRequest,
    PullRequestWithLabel
} from '../../changelog/pull-request-log.ts';
import type { Packtory, ReleasePlanPackage, ReleasePlanResult } from '../../packtory/packtory.ts';
import { createFakeFileManager, type FakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import { pullRequestChangedFileFactory } from '../../test-libraries/pull-request-log-fixtures.ts';
import {
    loadPlannedRelease,
    prepareReleaseChangelogs,
    type PlannedRelease,
    type ReleasePreparationDependencies
} from './release-preparation.ts';

type EngineSpecification = {
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

type DependencySpecification = {
    readonly createPullRequestLogEngine: SinonSpy;
    readonly fileManager: FakeFileManager;
    readonly log: SinonSpy;
    readonly packtory: Packtory;
    readonly readEnvironmentVariable: ReleasePreparationDependencies['readEnvironmentVariable'];
    readonly stopAll: SinonSpy;
};

type CreatedReleasePreparationDependencies = ReleasePreparationDependencies & {
    readonly createPullRequestLogEngine: SinonSpy;
    readonly fileManager: FakeFileManager;
    readonly log: SinonSpy;
    readonly stopAll: SinonSpy;
};

const validConfiguration = {
    changelog: { outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ] },
    packages: [
        {
            sourcesFolder: 'source/package-a',
            mainPackageManifest: { type: 'module' },
            name: 'package-a',
            roots: { main: { javaScript: 'index.js' } },
            publishSettings: { access: 'public' }
        }
    ]
} as const;

function createReleasePackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return {
        name: 'package-a',
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
        sourceFiles: [ 'source/package-a/index.ts' ],
        changelogDependencyNames: [],
        changelogDependencyUpdates: [],
        changelogSourceFiles: [ 'source/package-a/index.ts' ],
        ...overrides
    };
}

function createEngine(input: EngineSpecification): PullRequestLogEngine {
    return {
        collectMergedPullRequests: fake.resolves(input.pullRequests),
        filterPullRequestsByTargetFiles: fake(function () {
            return input.pullRequests;
        }),
        readPullRequestChangedFiles: fake.resolves(
            new Map([ [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/package-a/index.ts' }) ] ] ])
        ),
        readPullRequestLabels: fake.resolves(new Map([ [ 1, [ 'bug' ] ] ])),
        extractChangelogReleaseSection: fake(function (): never {
            throw new Error('unexpected changelog section extraction');
        }),
        renderChangelog: fake.returns(''),
        renderGroupedTargetChangelog: fake.returns(input.renderedMarkdown),
        renderTargetChangelog: fake.returns(input.renderedMarkdown),
        resolveChangelogBaseReference: fake.resolves({ reference: 'old-head' }),
        resolveLatestSemverChangelogBaseReference: fake.resolves({ reference: 'latest-semver' }),
        resolvePullRequestLabels: fake.resolves(input.labeledPullRequests),
        resolveVersionNumber: fake.returns('1.0.1'),
        updateChangelog: fake(function (changelogUpdate: ChangelogUpdateInput) {
            return `updated:\n${changelogUpdate.generatedChangelogMarkdown}`;
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
        inspectPackageDependencies: unusedPacktoryMethod,
        inspectPackageFiles: unusedPacktoryMethod,
        inspectPackageSymbols: unusedPacktoryMethod,
        inspectPackageSideEffects: unusedPacktoryMethod,
        inspectPackageTree: unusedPacktoryMethod,
        packAllPackages: unusedPacktoryMethod,
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

function createDefaultEngine(): PullRequestLogEngine {
    return createEngine({
        labeledPullRequests: [ { identifier: 1, label: 'bug', title: 'Fix package' } ],
        pullRequests: [ { identifier: 1, title: 'Fix package' } ],
        renderedMarkdown: '## package-a 1.0.1\n'
    });
}

function readDefaultEnvironmentVariable(name: 'GH_TOKEN' | 'GITHUB_TOKEN'): string | undefined {
    return name === 'GH_TOKEN' ? 'gh-token' : undefined;
}

function createDefaultDependencySpecification(): DependencySpecification {
    return {
        createPullRequestLogEngine: fake.returns(createDefaultEngine()),
        fileManager: createFakeFileManager(),
        log: fake(),
        packtory: createPacktory(Result.ok({ packages: [ createReleasePackage() ] })),
        readEnvironmentVariable: readDefaultEnvironmentVariable,
        stopAll: fake()
    };
}

function mergeDependencySpecification(overrides: Partial<DependencySpecification>): DependencySpecification {
    return { ...createDefaultDependencySpecification(), ...overrides };
}

function createDependencies(overrides: Partial<DependencySpecification> = {}): CreatedReleasePreparationDependencies {
    const input = mergeDependencySpecification(overrides);

    return {
        createPullRequestLogEngine: input.createPullRequestLogEngine,
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        fileManager: input.fileManager,
        log: input.log,
        packtory: input.packtory,
        readEnvironmentVariable: input.readEnvironmentVariable,
        async readPackageInformation() {
            return { repository: { url: 'https://github.com/owner/repo' } };
        },
        spinnerRenderer: {
            stopAll() {
                input.stopAll();
            }
        },
        configurationLoader: { load: fake.resolves(validConfiguration) },
        trace: false,
        workingDirectory: '/repo',
        stopAll: input.stopAll
    };
}

function plannedRelease(packages: readonly ReleasePlanPackage[] = [ createReleasePackage() ]): PlannedRelease {
    return { configuration: validConfiguration, packages };
}

function createEmptyChangelogDependencies(): CreatedReleasePreparationDependencies {
    return createDependencies({
        createPullRequestLogEngine: fake.returns(createEngine({
            labeledPullRequests: [],
            pullRequests: [],
            renderedMarkdown: ''
        }))
    });
}

suite('release-preparation', function () {
    test('loads a planned release and stops spinners after planning', async function () {
        const dependencies = createDependencies();

        assert.deepStrictEqual(await loadPlannedRelease(dependencies), plannedRelease());
        assert.strictEqual(dependencies.stopAll.callCount, 1);
    });

    test('logs release plan failures without returning a planned release', async function () {
        const dependencies = createDependencies({
            packtory: createPacktory(Result.err({ type: 'configuration', issues: [ 'bad config' ] }))
        });

        assert.strictEqual(await loadPlannedRelease(dependencies), undefined);
        assert.deepStrictEqual(dependencies.log.firstCall.args, [
            'Configuration issues, there are 1 issue(s)\n\n- bad config'
        ]);
    });

    test('uses GITHUB_TOKEN for changelog generation when GH_TOKEN is absent', async function () {
        const createPullRequestLogEngine = fake(function (options: Readonly<PullRequestLogEngineOptions>) {
            assert.partialDeepStrictEqual(options, {
                githubToken: 'github-token',
                workingDirectory: '/repo'
            });
            return createEngine({
                labeledPullRequests: [ { identifier: 1, label: 'bug', title: 'Fix package' } ],
                pullRequests: [ { identifier: 1, title: 'Fix package' } ],
                renderedMarkdown: '## package-a 1.0.1\n'
            });
        });
        const dependencies = createDependencies({
            createPullRequestLogEngine,
            readEnvironmentVariable(name) {
                return name === 'GITHUB_TOKEN' ? 'github-token' : undefined;
            }
        });

        const { changelog } = await prepareReleaseChangelogs(dependencies, plannedRelease(), true);

        assert.strictEqual(changelog.changelog.groupedMarkdown, '## package-a 1.0.1\n');
        assert.strictEqual(createPullRequestLogEngine.callCount, 1);
    });

    test('prefers GH_TOKEN over GITHUB_TOKEN for changelog generation', async function () {
        const createPullRequestLogEngine = fake(function (options: Readonly<PullRequestLogEngineOptions>) {
            assert.strictEqual(options.githubToken, 'gh-token');
            return createDefaultEngine();
        });
        const dependencies = createDependencies({
            createPullRequestLogEngine,
            readEnvironmentVariable(name) {
                return name === 'GH_TOKEN' ? 'gh-token' : 'github-token';
            }
        });

        await prepareReleaseChangelogs(dependencies, plannedRelease(), true);

        assert.strictEqual(createPullRequestLogEngine.callCount, 1);
    });

    test('rejects invalid changelog config before creating pr-log', async function () {
        const dependencies = createDependencies();

        await assert.rejects(
            prepareReleaseChangelogs(dependencies, { configuration: {}, packages: [ createReleasePackage() ] }, true),
            /The loaded config is invalid for changelog generation/u
        );
        assert.strictEqual(dependencies.createPullRequestLogEngine.callCount, 0);
    });

    test('prepares configured changelog files and returns their paths', async function () {
        const dependencies = createDependencies();

        const { writtenFiles, writtenPaths } = await prepareReleaseChangelogs(dependencies, plannedRelease(), true);

        assert.deepStrictEqual(writtenPaths, [ '/repo/CHANGELOG.md' ]);
        assert.deepStrictEqual(writtenFiles, [
            { content: 'updated:\n## package-a 1.0.1\n', filePath: '/repo/CHANGELOG.md' }
        ]);
        assert.deepStrictEqual(dependencies.fileManager.getAllWriteFileCalls(), []);
    });

    test('logs unchanged plans when no changelog files are written', async function () {
        const dependencies = createEmptyChangelogDependencies();

        const result = await prepareReleaseChangelogs(
            dependencies,
            plannedRelease([ createReleasePackage({ changed: false }) ]),
            false
        );

        assert.deepStrictEqual(result.writtenPaths, []);
        assert.deepStrictEqual(dependencies.log.firstCall.args, [ 'No changelog files were written.' ]);
    });

    test('reports packages without changelog entries when changelog files are optional', async function () {
        const dependencies = createEmptyChangelogDependencies();

        const result = await prepareReleaseChangelogs(
            dependencies,
            plannedRelease([
                createReleasePackage(),
                createReleasePackage({ name: 'package-b', changelogSourceFiles: [ 'source/package-b/index.ts' ] })
            ]),
            false
        );

        assert.deepStrictEqual(result.writtenPaths, []);
        assert.deepStrictEqual(dependencies.log.firstCall.args, [
            'No changelog files were written; changelog attribution found no pull requests for package-a, package-b.'
        ]);
    });

    test('reports only changed packages without changelog entries', async function () {
        const pullRequests: readonly PullRequest[] = [ { identifier: 1, title: 'Fix package' } ];
        const engine = {
            ...createEngine({
                labeledPullRequests: [ { identifier: 1, label: 'bug', title: 'Fix package' } ],
                pullRequests,
                renderedMarkdown: '## package-a 1.0.1\n'
            }),
            filterPullRequestsByTargetFiles: fake(function (input: PullRequestFilterInput) {
                return input.targetName === 'package-a' ? input.pullRequests : [];
            }),
            resolvePullRequestLabels: fake(async function (input: PullRequestLabelInput) {
                return input.pullRequests.map(function (pullRequest) {
                    return { identifier: pullRequest.identifier, label: 'bug', title: pullRequest.title };
                });
            })
        };
        const dependencies = createDependencies({
            createPullRequestLogEngine: fake.returns(engine)
        });

        const result = await prepareReleaseChangelogs(
            dependencies,
            plannedRelease([
                createReleasePackage(),
                createReleasePackage({ name: 'package-b', changelogSourceFiles: [ 'source/package-b/index.ts' ] })
            ]),
            true
        );

        assert.deepStrictEqual(result.changelog.changelog.packageNamesWithoutChangelogEntries, [ 'package-b' ]);
    });

    test('rejects required changelog generation when no files are written', async function () {
        const dependencies = createEmptyChangelogDependencies();

        await assert.rejects(
            prepareReleaseChangelogs(dependencies, plannedRelease(), true),
            /No changelog files were written; changelog attribution found no pull requests for package-a\./u
        );
        assert.deepStrictEqual(dependencies.log.getCalls(), []);
    });
});
