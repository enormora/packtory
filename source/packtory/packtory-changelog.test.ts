import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { defaultPrLogConfig as defaultPullRequestLogConfiguration } from '@pr-log/core';
import type { PullRequest, PullRequestWithLabel, PullRequestLogEngine } from '../changelog/pull-request-log.ts';
import type {
    FilterPullRequestsByTargetFilesInput,
    RenderGroupedTargetChangelogMarkdownInput,
    ResolvePullRequestLabelsOptions
} from '../test-libraries/changelog-handler-fixtures.ts';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { pullRequestChangedFileFactory } from '../test-libraries/pull-request-log-fixtures.ts';
import { generateChangelogOutputs } from './packtory-changelog.ts';
import type { ReleasePlanPackage } from './packtory-results.ts';

const pullRequestLogConfiguration = {
    ...defaultPullRequestLogConfiguration,
    validLabels: new Map([ [ 'bug', 'Bug Fixes' ] ]),
    versionBumps: { major: [], minor: [], patch: [ 'bug' ] }
};

function releasePackage(overrides: Partial<ReleasePlanPackage>): ReleasePlanPackage {
    return {
        name: 'package-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: 'substantive',
        changed: true,
        previousGitHead: undefined,
        currentGitHead: 'current-head',
        latestRegistryMetadata: undefined,
        artifactFiles: [ 'dist/index.js' ],
        changedArtifactFiles: [ 'dist/index.js' ],
        sourceFiles: [ 'source/package-a.ts' ],
        changelogSourceFiles: [ 'source/package-a.ts' ],
        changelogDependencyNames: [],
        changelogDependencyUpdates: [],
        ...overrides
    };
}

type EngineCalls = {
    readonly collectMergedPullRequests: SinonSpy;
    readonly filterPullRequestsByTargetFiles: SinonSpy<
        readonly [FilterPullRequestsByTargetFilesInput],
        readonly PullRequest[]
    >;
    readonly readPullRequestChangedFiles: SinonSpy;
    readonly renderGroupedTargetChangelog: SinonSpy<readonly [RenderGroupedTargetChangelogMarkdownInput], string>;
    readonly renderTargetChangelog: SinonSpy;
    readonly resolveChangelogBaseReference: SinonSpy;
    readonly resolveLatestSemverChangelogBaseReference: SinonSpy;
    readonly resolvePullRequestLabels: SinonSpy;
    readonly resolveVersionNumber: SinonSpy;
};

type EngineFixture = {
    readonly engine: PullRequestLogEngine;
    readonly calls: EngineCalls;
};

type TargetChangelogInput = {
    readonly targetName: string;
};

type ChangelogBaseReferenceInput = {
    readonly packageName: string;
};

type LabelOptionsInput = {
    readonly targetScopedLabelPattern: string;
};

function createEngine(): EngineFixture {
    const pullRequests: readonly PullRequest[] = [
        { identifier: 1, title: 'Fix package' },
        { identifier: 2, title: 'Update changelog only' }
    ];
    const labeledPullRequests: readonly PullRequestWithLabel[] = [ {
        identifier: 1,
        title: 'Fix package',
        label: 'bug'
    } ];
    const calls: EngineCalls = {
        collectMergedPullRequests: fake.resolves(pullRequests),
        filterPullRequestsByTargetFiles: fake(function (input: FilterPullRequestsByTargetFilesInput) {
            return input.pullRequests.slice(0, 1);
        }),
        readPullRequestChangedFiles: fake.resolves(
            new Map([
                [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/package-a.ts' }) ] ],
                [ 2, [ pullRequestChangedFileFactory.build({ path: 'CHANGELOG.md' }) ] ]
            ])
        ),
        renderGroupedTargetChangelog: fake(function (input: RenderGroupedTargetChangelogMarkdownInput) {
            return input
                .targets
                .map(function (target) {
                    return target.targetName;
                })
                .join('\n');
        }),
        renderTargetChangelog: fake(function (input: TargetChangelogInput) {
            return `# ${input.targetName}\n`;
        }),
        resolveChangelogBaseReference: fake(async function (input: ChangelogBaseReferenceInput) {
            return { reference: `${input.packageName}-base` };
        }),
        resolveLatestSemverChangelogBaseReference: fake.resolves({ reference: 'latest-semver' }),
        resolvePullRequestLabels: fake.resolves(labeledPullRequests),
        resolveVersionNumber: fake.returns('1.0.1')
    };

    return { engine: calls as unknown as PullRequestLogEngine, calls };
}

async function render(packages: readonly ReleasePlanPackage[], engine: PullRequestLogEngine): Promise<string> {
    const changelog = await generateChangelogOutputs({
        packages,
        pullRequestLogEngine: engine,
        changelogSourceFileRootsByPackageName: new Map(),
        explicitBaseReference: undefined,
        githubRepository: 'owner/repo',
        packageTagFormat: undefined,
        currentDate: new Date('2026-06-13T00:00:00.000Z'),
        ignoredAttributionPaths: [],
        pullRequestLogConfiguration,
        targetScopedLabelPattern: undefined
    });
    return changelog.groupedMarkdown;
}

function registerTargetSelectionTests(): void {
    test('excludes unchanged packages from pr-log targets', async function () {
        const { engine, calls } = createEngine();

        await render([ releasePackage({ changed: false, artifactState: 'unchanged' }) ], engine);

        assertDeepSubset(calls, {
            collectMergedPullRequests: {
                callCount: 0
            },
            renderGroupedTargetChangelog: {
                callCount: 1
            }
        });
        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, []);
    });

    test('renders changed and first-publish packages as released targets with their next versions', async function () {
        const { engine, calls } = createEngine();
        const packages = [
            releasePackage({ name: 'package-a', nextVersion: '1.0.1' }),
            releasePackage({
                name: 'package-b',
                previousVersion: undefined,
                previousGitHead: undefined,
                nextVersion: '0.1.0',
                artifactState: 'first-publish'
            })
        ];

        await render(packages, engine);

        assert.strictEqual(calls.resolveChangelogBaseReference.callCount, 1);
        assert.deepStrictEqual(calls.resolveChangelogBaseReference.firstCall.args[0], {
            packageName: 'package-a',
            previousVersion: '1.0.0',
            previousGitHead: undefined,
            packageTagFormat: undefined,
            explicitBaseReference: undefined
        });
        assert.strictEqual(calls.resolveLatestSemverChangelogBaseReference.callCount, 1);
        assert.deepStrictEqual(calls.collectMergedPullRequests.firstCall.args[0], {
            githubRepository: 'owner/repo',
            baseReference: 'package-a-base'
        });
        assert.deepStrictEqual(calls.readPullRequestChangedFiles.firstCall.args[0], {
            githubRepository: 'owner/repo',
            pullRequests: [
                { identifier: 1, title: 'Fix package' },
                { identifier: 2, title: 'Update changelog only' }
            ]
        });
        assert.deepStrictEqual(calls.resolvePullRequestLabels.firstCall.args[0], {
            githubRepository: 'owner/repo',
            configuration: pullRequestLogConfiguration,
            pullRequests: [ { identifier: 1, title: 'Fix package' } ],
            targetName: 'package-a',
            targetScopedLabelPattern: undefined
        });
        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, [
            {
                targetName: 'package-a',
                unreleased: false,
                versionNumber: '1.0.1',
                mergedPullRequests: [ { identifier: 1, title: 'Fix package', label: 'bug' } ]
            },
            {
                targetName: 'package-b',
                unreleased: false,
                versionNumber: '0.1.0',
                mergedPullRequests: [ { identifier: 1, title: 'Fix package', label: 'bug' } ]
            }
        ]);
    });

    test('filters pull requests with changelog source files and ignored changelog paths', async function () {
        const { engine, calls } = createEngine();

        await render(
            [
                releasePackage({
                    artifactFiles: [ 'dist/index.js' ],
                    changedArtifactFiles: [ 'dist/index.js' ],
                    sourceFiles: [ 'source/package-a.ts' ],
                    changelogSourceFiles: [ 'source/package-a.ts', 'CHANGELOG.md' ]
                })
            ],
            engine
        );

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0], {
            targetName: 'package-a',
            targetSourceFiles: [ 'source/package-a.ts', 'CHANGELOG.md' ],
            pullRequests: [
                { identifier: 1, title: 'Fix package' },
                { identifier: 2, title: 'Update changelog only' }
            ],
            changedFilesByPullRequest: new Map([
                [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/package-a.ts' }) ] ],
                [ 2, [ pullRequestChangedFileFactory.build({ path: 'CHANGELOG.md' }) ] ]
            ]),
            ignoredAttributionPaths: [ 'CHANGELOG.md' ]
        });
    });

    test('does not add deleted source files when no package source root is configured', async function () {
        const { engine, calls } = createEngine();
        const readPullRequestChangedFiles = fake.resolves(
            new Map([
                [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/removed.ts', status: 'removed' }) ] ]
            ])
        );
        const sourceRootlessEngine = {
            ...engine,
            readPullRequestChangedFiles
        } as unknown as PullRequestLogEngine;

        await render(
            [
                releasePackage({
                    changelogSourceFiles: [],
                    sourceFiles: [],
                    changedArtifactFiles: []
                })
            ],
            sourceRootlessEngine
        );

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0].targetSourceFiles, []);
    });
}

function registerDependencyUpdateTests(): void {
    test('renders dependency-only package changes as dependency updates', async function () {
        const { engine, calls } = createEngine();

        await render(
            [
                releasePackage({
                    releaseClassification: 'dependency-only',
                    changedArtifactFiles: [ 'package.json', 'software-bill-of-materials.cyclonedx.json' ]
                })
            ],
            engine
        );

        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, [
            {
                targetName: 'package-a',
                unreleased: false,
                versionNumber: '1.0.1',
                mergedPullRequests: [ { identifier: 1, title: 'Update dependencies', label: 'upgrade' } ]
            }
        ]);
        assert.strictEqual(
            calls.renderGroupedTargetChangelog.firstCall.args[0].configuration.validLabels.get('upgrade'),
            'Dependency Upgrades'
        );
    });

    test('renders single dependency-only package changes with the dependency version', async function () {
        const { engine, calls } = createEngine();

        await render(
            [
                releasePackage({
                    releaseClassification: 'dependency-only',
                    changelogDependencyNames: [ '@scope/package' ],
                    changelogDependencyUpdates: [ { name: '@scope/package', version: '1.2.3' } ]
                })
            ],
            engine
        );

        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, [
            {
                targetName: 'package-a',
                unreleased: false,
                versionNumber: '1.0.1',
                mergedPullRequests: [ { identifier: 0, title: 'Update @scope/package to 1.2.3', label: 'upgrade' } ]
            }
        ]);
    });

    test('renders multiple dependency-only package changes with the generic dependency title', async function () {
        const { engine, calls } = createEngine();

        await render(
            [
                releasePackage({
                    releaseClassification: 'dependency-only',
                    changelogDependencyUpdates: [
                        { name: 'left', version: '1.0.1' },
                        { name: 'right', version: '2.0.1' }
                    ]
                })
            ],
            engine
        );

        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets[0]?.mergedPullRequests, [
            { identifier: 0, title: 'Update dependencies', label: 'upgrade' }
        ]);
    });

    test('rejects malformed single dependency-only package changes', async function () {
        const { engine } = createEngine();

        await assert.rejects(
            render(
                [
                    releasePackage({
                        releaseClassification: 'dependency-only',
                        changelogDependencyUpdates: [ undefined as never ]
                    })
                ],
                engine
            ),
            { message: 'Expected a dependency update' }
        );
    });

    test('preserves configured dependency update changelog labels', async function () {
        const { engine, calls } = createEngine();
        const customPullRequestLogConfiguration = {
            ...pullRequestLogConfiguration,
            validLabels: new Map([ ...pullRequestLogConfiguration.validLabels, [ 'upgrade', 'Upgrades' ] ])
        };

        await generateChangelogOutputs({
            packages: [ releasePackage({ releaseClassification: 'dependency-only' }) ],
            pullRequestLogEngine: engine,
            changelogSourceFileRootsByPackageName: new Map(),
            githubRepository: 'owner/repo',
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            explicitBaseReference: undefined,
            ignoredAttributionPaths: [],
            packageTagFormat: undefined,
            pullRequestLogConfiguration: customPullRequestLogConfiguration,
            targetScopedLabelPattern: undefined
        });

        assert.strictEqual(
            calls.renderGroupedTargetChangelog.firstCall.args[0].configuration,
            customPullRequestLogConfiguration
        );
        assert.strictEqual(
            calls.renderGroupedTargetChangelog.firstCall.args[0].configuration.validLabels.get('upgrade'),
            'Upgrades'
        );
    });

    test('includes manifest dependency pull requests whose titles mention changed dependencies', async function () {
        const { engine, calls } = createEngine();
        const filterPullRequestsByTargetFiles = fake.returns([]);
        const collectMergedPullRequests = fake.resolves([
            { identifier: 1, title: 'Update React to v19' },
            { identifier: 2, title: 'Update unrelated lockfile' },
            { identifier: 3, title: 'Update react without manifest input' },
            { identifier: 4, title: 'Update React without changed files' }
        ]);
        const readPullRequestChangedFiles = fake.resolves(
            new Map([
                [
                    1,
                    [
                        pullRequestChangedFileFactory.build({ path: 'package-lock.json' }),
                        pullRequestChangedFileFactory.build({ path: 'source/index.ts' })
                    ]
                ],
                [ 2, [ pullRequestChangedFileFactory.build({ path: 'package-lock.json' }) ] ],
                [ 3, [ pullRequestChangedFileFactory.build({ path: 'source/index.ts' }) ] ]
            ])
        );
        const dependencyEngine = {
            ...engine,
            collectMergedPullRequests,
            filterPullRequestsByTargetFiles,
            readPullRequestChangedFiles
        } as unknown as PullRequestLogEngine;

        await render([ releasePackage({ changelogDependencyNames: [ 'react', 'vue' ] }) ], dependencyEngine);

        const labelOptions = calls.resolvePullRequestLabels.firstCall.args[0] as ResolvePullRequestLabelsOptions;
        assert.deepStrictEqual(labelOptions.pullRequests, [
            { identifier: 1, title: 'Update React to v19' }
        ]);
    });
}

function registerPackageChangelogTests(): void {
    test('omits package changelog markdown for packages without attributed pull requests', async function () {
        const { engine, calls } = createEngine();
        const emptyLabelResolver = fake.resolves([]);
        const renderTargetChangelog = fake.returns('## 1.0.1 (June 13, 2026)\n');
        const emptyEngine = {
            ...engine,
            resolvePullRequestLabels: emptyLabelResolver,
            renderTargetChangelog
        } as unknown as PullRequestLogEngine;

        const changelog = await generateChangelogOutputs({
            packages: [ releasePackage({ changelogSourceFiles: [ 'source/package-a.ts' ] }) ],
            pullRequestLogEngine: emptyEngine,
            changelogSourceFileRootsByPackageName: new Map(),
            githubRepository: 'owner/repo',
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            explicitBaseReference: undefined,
            ignoredAttributionPaths: [],
            packageTagFormat: undefined,
            pullRequestLogConfiguration,
            targetScopedLabelPattern: undefined
        });

        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, []);
        assertDeepSubset(changelog, {
            packageNamesWithoutChangelogEntries: [ 'package-a' ],
            packageMarkdownByName: new Map()
        });
        assert.strictEqual(renderTargetChangelog.callCount, 0);
    });
}

function registerAttributionPathTests(): void {
    test('uses the package base-ref resolver when a package has a previous git head but no previous version', async function () {
        const { engine, calls } = createEngine();

        await render([ releasePackage({ previousVersion: undefined, previousGitHead: 'previous-head' }) ], engine);

        assert.strictEqual(calls.resolveLatestSemverChangelogBaseReference.callCount, 0);
        assert.deepStrictEqual(calls.resolveChangelogBaseReference.firstCall.args[0], {
            packageName: 'package-a',
            previousVersion: undefined,
            previousGitHead: 'previous-head',
            packageTagFormat: undefined,
            explicitBaseReference: undefined
        });
    });

    test('does not ignore files whose name only starts with CHANGELOG.md', async function () {
        const { engine, calls } = createEngine();

        await render([ releasePackage({ changelogSourceFiles: [ 'documentation/CHANGELOG.md.bak' ] }) ], engine);

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0].ignoredAttributionPaths, []);
    });

    test('ignores nested CHANGELOG.md files', async function () {
        const { engine, calls } = createEngine();

        await render([ releasePackage({ changelogSourceFiles: [ 'documentation/CHANGELOG.md' ] }) ], engine);

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0].ignoredAttributionPaths, [
            'documentation/CHANGELOG.md'
        ]);
    });

    test('adds generated changelog paths to ignored attribution paths', async function () {
        const { engine, calls } = createEngine();

        await generateChangelogOutputs({
            packages: [ releasePackage({ changelogSourceFiles: [ 'source/package-a.ts' ] }) ],
            pullRequestLogEngine: engine,
            changelogSourceFileRootsByPackageName: new Map(),
            githubRepository: 'owner/repo',
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            explicitBaseReference: undefined,
            ignoredAttributionPaths: [ 'documentation/generated.md' ],
            packageTagFormat: undefined,
            pullRequestLogConfiguration,
            targetScopedLabelPattern: undefined
        });

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0].ignoredAttributionPaths, [
            'documentation/generated.md'
        ]);
    });
}

function registerOptionForwardingTests(): void {
    test('passes configured base-ref and label options to pr-log', async function () {
        const { engine, calls } = createEngine();

        await generateChangelogOutputs({
            packages: [ releasePackage({ previousVersion: undefined, previousGitHead: undefined }) ],
            pullRequestLogEngine: engine,
            changelogSourceFileRootsByPackageName: new Map(),
            explicitBaseReference: 'release-base',
            githubRepository: 'owner/repo',
            packageTagFormat: 'pkg/{packageName}/v{version}',
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            ignoredAttributionPaths: [],
            pullRequestLogConfiguration,
            targetScopedLabelPattern: 'scope:{targetName}:{label}'
        });

        assert.strictEqual(calls.resolveLatestSemverChangelogBaseReference.callCount, 0);
        assert.deepStrictEqual(calls.resolveChangelogBaseReference.firstCall.args[0], {
            packageName: 'package-a',
            previousVersion: undefined,
            previousGitHead: undefined,
            packageTagFormat: 'pkg/{packageName}/v{version}',
            explicitBaseReference: 'release-base'
        });
        const labelInput = calls.resolvePullRequestLabels.firstCall.args[0] as LabelOptionsInput;
        assert.strictEqual(labelInput.targetScopedLabelPattern, 'scope:{targetName}:{label}');
    });
}

suite('packtory-changelog', function () {
    registerTargetSelectionTests();
    registerDependencyUpdateTests();
    registerPackageChangelogTests();
    registerAttributionPathTests();
    registerOptionForwardingTests();
});
