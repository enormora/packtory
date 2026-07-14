import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import {
    defaultPrLogConfig,
    type FilterPullRequestsByTargetFilesInput,
    type PrLogEngine,
    type PullRequest,
    type PullRequestWithLabel,
    type RenderGroupedTargetChangelogMarkdownInput,
    type ResolvePullRequestLabelsOptions
} from '@pr-log/core';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { pullRequestChangedFileFactory } from '../test-libraries/pr-log-fixtures.ts';
import { generateChangelogOutputs } from './packtory-changelog.ts';
import type { ReleasePlanPackage } from './packtory-results.ts';

const prLogConfig = {
    ...defaultPrLogConfig,
    validLabels: new Map([ [ 'bug', 'Bug Fixes' ] ]),
    versionBumps: { major: [], minor: [], patch: [ 'bug' ] }
};

function releasePackage(overrides: Partial<ReleasePlanPackage>): ReleasePlanPackage {
    return {
        name: 'pkg-a',
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
        sourceFiles: [ 'source/pkg-a.ts' ],
        changelogSourceFiles: [ 'source/pkg-a.ts' ],
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
    readonly resolveChangelogBaseRef: SinonSpy;
    readonly resolveLatestSemverChangelogBaseRef: SinonSpy;
    readonly resolvePullRequestLabels: SinonSpy;
    readonly resolveVersionNumber: SinonSpy;
};

type EngineFixture = {
    readonly engine: PrLogEngine;
    readonly calls: EngineCalls;
};

type TargetChangelogInput = {
    readonly targetName: string;
};

type ChangelogBaseRefInput = {
    readonly packageName: string;
};

type LabelOptionsInput = {
    readonly targetScopedLabelPattern: string;
};

function createEngine(): EngineFixture {
    const pullRequests: readonly PullRequest[] = [
        { id: 1, title: 'Fix package' },
        { id: 2, title: 'Update changelog only' }
    ];
    const labeledPullRequests: readonly PullRequestWithLabel[] = [ { id: 1, title: 'Fix package', label: 'bug' } ];
    const calls: EngineCalls = {
        collectMergedPullRequests: fake.resolves(pullRequests),
        filterPullRequestsByTargetFiles: fake(function (input: FilterPullRequestsByTargetFilesInput) {
            return input.pullRequests.slice(0, 1);
        }),
        readPullRequestChangedFiles: fake.resolves(
            new Map([
                [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/pkg-a.ts' }) ] ],
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
        resolveChangelogBaseRef: fake(async function (input: ChangelogBaseRefInput) {
            return { ref: `${input.packageName}-base` };
        }),
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest-semver' }),
        resolvePullRequestLabels: fake.resolves(labeledPullRequests),
        resolveVersionNumber: fake.returns('1.0.1')
    };

    return { engine: calls as unknown as PrLogEngine, calls };
}

async function render(packages: readonly ReleasePlanPackage[], engine: PrLogEngine): Promise<string> {
    const changelog = await generateChangelogOutputs({
        packages,
        prLogEngine: engine,
        explicitBaseRef: undefined,
        githubRepo: 'owner/repo',
        packageTagFormat: undefined,
        currentDate: new Date('2026-06-13T00:00:00.000Z'),
        ignoredAttributionPaths: [],
        prLogConfig,
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
            releasePackage({ name: 'pkg-a', nextVersion: '1.0.1' }),
            releasePackage({
                name: 'pkg-b',
                previousVersion: undefined,
                previousGitHead: undefined,
                nextVersion: '0.1.0',
                artifactState: 'first-publish'
            })
        ];

        await render(packages, engine);

        assert.strictEqual(calls.resolveChangelogBaseRef.callCount, 1);
        assert.deepStrictEqual(calls.resolveChangelogBaseRef.firstCall.args[0], {
            packageName: 'pkg-a',
            previousVersion: '1.0.0',
            previousGitHead: undefined,
            packageTagFormat: undefined,
            explicitBaseRef: undefined
        });
        assert.strictEqual(calls.resolveLatestSemverChangelogBaseRef.callCount, 1);
        assert.deepStrictEqual(calls.collectMergedPullRequests.firstCall.args[0], {
            githubRepo: 'owner/repo',
            baseRef: 'pkg-a-base'
        });
        assert.deepStrictEqual(calls.readPullRequestChangedFiles.firstCall.args[0], {
            githubRepo: 'owner/repo',
            pullRequests: [
                { id: 1, title: 'Fix package' },
                { id: 2, title: 'Update changelog only' }
            ]
        });
        assert.deepStrictEqual(calls.resolvePullRequestLabels.firstCall.args[0], {
            githubRepo: 'owner/repo',
            config: prLogConfig,
            pullRequests: [ { id: 1, title: 'Fix package' } ],
            targetName: 'pkg-a',
            targetScopedLabelPattern: undefined
        });
        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, [
            {
                targetName: 'pkg-a',
                unreleased: false,
                versionNumber: '1.0.1',
                mergedPullRequests: [ { id: 1, title: 'Fix package', label: 'bug' } ]
            },
            {
                targetName: 'pkg-b',
                unreleased: false,
                versionNumber: '0.1.0',
                mergedPullRequests: [ { id: 1, title: 'Fix package', label: 'bug' } ]
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
                    sourceFiles: [ 'source/pkg-a.ts' ],
                    changelogSourceFiles: [ 'source/pkg-a.ts', 'CHANGELOG.md' ]
                })
            ],
            engine
        );

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0], {
            targetName: 'pkg-a',
            targetSourceFiles: [ 'source/pkg-a.ts', 'CHANGELOG.md' ],
            pullRequests: [
                { id: 1, title: 'Fix package' },
                { id: 2, title: 'Update changelog only' }
            ],
            changedFilesByPullRequest: new Map([
                [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/pkg-a.ts' }) ] ],
                [ 2, [ pullRequestChangedFileFactory.build({ path: 'CHANGELOG.md' }) ] ]
            ]),
            ignoredAttributionPaths: [ 'CHANGELOG.md' ]
        });
    });
}

function registerDependencyUpdateTests(): void {
    test('renders dependency-only package changes as dependency updates', async function () {
        const { engine, calls } = createEngine();

        await render(
            [
                releasePackage({
                    releaseClassification: 'dependency-only',
                    changedArtifactFiles: [ 'package.json', 'sbom.cdx.json' ]
                })
            ],
            engine
        );

        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, [
            {
                targetName: 'pkg-a',
                unreleased: false,
                versionNumber: '1.0.1',
                mergedPullRequests: [ { id: 1, title: 'Update dependencies', label: 'upgrade' } ]
            }
        ]);
        assert.strictEqual(
            calls.renderGroupedTargetChangelog.firstCall.args[0].config.validLabels.get('upgrade'),
            'Dependency Upgrades'
        );
    });

    test('renders single dependency-only package changes with the dependency version', async function () {
        const { engine, calls } = createEngine();

        await render(
            [
                releasePackage({
                    releaseClassification: 'dependency-only',
                    changelogDependencyNames: [ '@scope/pkg' ],
                    changelogDependencyUpdates: [ { name: '@scope/pkg', version: '1.2.3' } ]
                })
            ],
            engine
        );

        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, [
            {
                targetName: 'pkg-a',
                unreleased: false,
                versionNumber: '1.0.1',
                mergedPullRequests: [ { id: 0, title: 'Update @scope/pkg to 1.2.3', label: 'upgrade' } ]
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
            { id: 0, title: 'Update dependencies', label: 'upgrade' }
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
        const customPrLogConfig = {
            ...prLogConfig,
            validLabels: new Map([ ...prLogConfig.validLabels, [ 'upgrade', 'Upgrades' ] ])
        };

        await generateChangelogOutputs({
            packages: [ releasePackage({ releaseClassification: 'dependency-only' }) ],
            prLogEngine: engine,
            githubRepo: 'owner/repo',
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            explicitBaseRef: undefined,
            ignoredAttributionPaths: [],
            packageTagFormat: undefined,
            prLogConfig: customPrLogConfig,
            targetScopedLabelPattern: undefined
        });

        assert.strictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].config, customPrLogConfig);
        assert.strictEqual(
            calls.renderGroupedTargetChangelog.firstCall.args[0].config.validLabels.get('upgrade'),
            'Upgrades'
        );
    });

    test('includes manifest dependency pull requests whose titles mention changed dependencies', async function () {
        const { engine, calls } = createEngine();
        const filterPullRequestsByTargetFiles = fake.returns([]);
        const collectMergedPullRequests = fake.resolves([
            { id: 1, title: 'Update React to v19' },
            { id: 2, title: 'Update unrelated lockfile' },
            { id: 3, title: 'Update react without manifest input' },
            { id: 4, title: 'Update React without changed files' }
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
        } as unknown as PrLogEngine;

        await render([ releasePackage({ changelogDependencyNames: [ 'react', 'vue' ] }) ], dependencyEngine);

        const labelOptions = calls.resolvePullRequestLabels.firstCall.args[0] as ResolvePullRequestLabelsOptions;
        assert.deepStrictEqual(labelOptions.pullRequests, [
            { id: 1, title: 'Update React to v19' }
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
        } as unknown as PrLogEngine;

        const changelog = await generateChangelogOutputs({
            packages: [ releasePackage({ changelogSourceFiles: [ 'source/pkg-a.ts' ] }) ],
            prLogEngine: emptyEngine,
            githubRepo: 'owner/repo',
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            explicitBaseRef: undefined,
            ignoredAttributionPaths: [],
            packageTagFormat: undefined,
            prLogConfig,
            targetScopedLabelPattern: undefined
        });

        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, []);
        assertDeepSubset(changelog, {
            packageNamesWithoutChangelogEntries: [ 'pkg-a' ],
            packageMarkdownByName: new Map()
        });
        assert.strictEqual(renderTargetChangelog.callCount, 0);
    });
}

function registerAttributionPathTests(): void {
    test('uses the package base-ref resolver when a package has a previous git head but no previous version', async function () {
        const { engine, calls } = createEngine();

        await render([ releasePackage({ previousVersion: undefined, previousGitHead: 'previous-head' }) ], engine);

        assert.strictEqual(calls.resolveLatestSemverChangelogBaseRef.callCount, 0);
        assert.deepStrictEqual(calls.resolveChangelogBaseRef.firstCall.args[0], {
            packageName: 'pkg-a',
            previousVersion: undefined,
            previousGitHead: 'previous-head',
            packageTagFormat: undefined,
            explicitBaseRef: undefined
        });
    });

    test('does not ignore files whose name only starts with CHANGELOG.md', async function () {
        const { engine, calls } = createEngine();

        await render([ releasePackage({ changelogSourceFiles: [ 'docs/CHANGELOG.md.bak' ] }) ], engine);

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0].ignoredAttributionPaths, []);
    });

    test('ignores nested CHANGELOG.md files', async function () {
        const { engine, calls } = createEngine();

        await render([ releasePackage({ changelogSourceFiles: [ 'docs/CHANGELOG.md' ] }) ], engine);

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0].ignoredAttributionPaths, [
            'docs/CHANGELOG.md'
        ]);
    });

    test('adds generated changelog paths to ignored attribution paths', async function () {
        const { engine, calls } = createEngine();

        await generateChangelogOutputs({
            packages: [ releasePackage({ changelogSourceFiles: [ 'source/pkg-a.ts' ] }) ],
            prLogEngine: engine,
            githubRepo: 'owner/repo',
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            explicitBaseRef: undefined,
            ignoredAttributionPaths: [ 'docs/generated.md' ],
            packageTagFormat: undefined,
            prLogConfig,
            targetScopedLabelPattern: undefined
        });

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0].ignoredAttributionPaths, [
            'docs/generated.md'
        ]);
    });
}

function registerOptionForwardingTests(): void {
    test('passes configured base-ref and label options to pr-log', async function () {
        const { engine, calls } = createEngine();

        await generateChangelogOutputs({
            packages: [ releasePackage({ previousVersion: undefined, previousGitHead: undefined }) ],
            prLogEngine: engine,
            explicitBaseRef: 'release-base',
            githubRepo: 'owner/repo',
            packageTagFormat: 'pkg/{packageName}/v{version}',
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            ignoredAttributionPaths: [],
            prLogConfig,
            targetScopedLabelPattern: 'scope:{targetName}:{label}'
        });

        assert.strictEqual(calls.resolveLatestSemverChangelogBaseRef.callCount, 0);
        assert.deepStrictEqual(calls.resolveChangelogBaseRef.firstCall.args[0], {
            packageName: 'pkg-a',
            previousVersion: undefined,
            previousGitHead: undefined,
            packageTagFormat: 'pkg/{packageName}/v{version}',
            explicitBaseRef: 'release-base'
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
