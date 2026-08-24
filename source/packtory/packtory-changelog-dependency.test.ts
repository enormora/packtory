import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import {
    defaultPrLogConfig,
    type ChangelogEntryInput,
    type FilterPullRequestsByTargetFilesInput,
    type PullRequest,
    type PullRequestChangedFile,
    type PullRequestWithLabel,
    type RenderGroupedTargetChangelogMarkdownInput,
    type RenderTargetChangelogMarkdownInput,
    type ResolvePullRequestLabelsOptions
} from '@pr-log/core';
import { pullRequestChangedFileFactory } from '../test-libraries/pr-log-fixtures.ts';
import { generateChangelogOutputs, type GenerateChangelogInput } from './packtory-changelog.ts';
import type { ReleasePlanPackage } from './packtory-results.ts';

type ChangelogEngine = GenerateChangelogInput['prLogEngine'];

const reactDependencyMarkdown = '* Update react to 19.0.0 ([#1](https://github.com/owner/repo/pull/1))';

function releasePackage(overrides: Partial<ReleasePlanPackage>): ReleasePlanPackage {
    return {
        name: 'pkg-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: 'dependency-only',
        changed: true,
        previousGitHead: undefined,
        currentGitHead: 'current-head',
        latestRegistryMetadata: undefined,
        artifactFiles: [ 'dist/index.js' ],
        changedArtifactFiles: [ 'package.json' ],
        sourceFiles: [ 'source/pkg-a.ts' ],
        changelogSourceFiles: [ 'source/pkg-a.ts' ],
        changelogDependencyNames: [ '@scope/pkg' ],
        changelogDependencyUpdates: [ { name: '@scope/pkg', version: '1.2.3' } ],
        ...overrides
    };
}

function renderPullRequests(pullRequests: readonly ChangelogEntryInput[]): string {
    return pullRequests
        .map(function (pullRequest) {
            if (pullRequest.id === undefined) {
                return `* ${pullRequest.title}`;
            }
            return `* ${pullRequest.title} ([#${pullRequest.id}](https://github.com/owner/repo/pull/${pullRequest.id}))`;
        })
        .join('\n');
}

function testPullRequest(id: number, title: string): PullRequest {
    return { id, title };
}

function changedFilesByPullRequest(
    entries: readonly (readonly [number, string])[]
): Map<number, PullRequestChangedFile[]> {
    return new Map(
        entries.map(function ([ id, filePath ]) {
            return [ id, [ pullRequestChangedFileFactory.build({ path: filePath }) ] ];
        })
    );
}

function labelUpgradesById(upgradeIds: ReadonlySet<number>): ChangelogEngine['resolvePullRequestLabels'] {
    return fake(async function (options: ResolvePullRequestLabelsOptions) {
        return options.pullRequests.map(function (pullRequest): PullRequestWithLabel {
            return {
                ...pullRequest,
                label: upgradeIds.has(pullRequest.id) ? 'upgrade' : 'bug'
            };
        });
    });
}

function createEngine(overrides: Partial<ChangelogEngine>): ChangelogEngine {
    const pullRequests: readonly PullRequest[] = [ { id: 1, title: 'Fix package' } ];
    return {
        collectMergedPullRequests: fake.resolves(pullRequests),
        filterPullRequestsByTargetFiles: fake(function (input: FilterPullRequestsByTargetFilesInput) {
            return input.pullRequests;
        }),
        readPullRequestChangedFiles: fake.resolves(
            new Map([ [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/pkg-a.ts' }) ] ] ])
        ),
        renderGroupedTargetChangelog: fake(function (input: RenderGroupedTargetChangelogMarkdownInput) {
            return renderPullRequests(input.targets.flatMap(function (target) {
                return target.mergedPullRequests;
            }));
        }),
        renderTargetChangelog: fake(function (input: RenderTargetChangelogMarkdownInput) {
            return renderPullRequests(input.mergedPullRequests);
        }),
        resolveChangelogBaseRef: fake.resolves({ ref: 'pkg-a-base' }),
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest-semver' }),
        resolvePullRequestLabels: fake(async function (options: ResolvePullRequestLabelsOptions) {
            return options.pullRequests.map(function (pullRequest): PullRequestWithLabel {
                return { ...pullRequest, label: 'bug' };
            });
        }),
        ...overrides
    };
}

async function generate(
    packages: readonly ReleasePlanPackage[],
    engine: ChangelogEngine
): ReturnType<typeof generateChangelogOutputs> {
    return generateChangelogOutputs({
        packages,
        prLogEngine: engine,
        changelogSourceFileRootsByPackageName: new Map(),
        githubRepo: 'owner/repo',
        currentDate: new Date('2026-06-13T00:00:00.000Z'),
        explicitBaseRef: undefined,
        ignoredAttributionPaths: [],
        packageTagFormat: undefined,
        prLogConfig: defaultPrLogConfig,
        targetScopedLabelPattern: undefined
    });
}

function reactDependencyPackage(): ReleasePlanPackage {
    return releasePackage({
        changelogDependencyNames: [ 'react' ],
        changelogDependencyUpdates: [ { name: 'react', version: '19.0.0' } ]
    });
}

async function generateReactDependencyChangelog(engine: ChangelogEngine): ReturnType<typeof generateChangelogOutputs> {
    return generate([ reactDependencyPackage() ], engine);
}

function eslintUpdateTitle(): string {
    return 'Update dependency eslint to v10.9.0';
}

function eslintUpdatePullRequest(): PullRequest {
    return testPullRequest(2, eslintUpdateTitle());
}

function changedFilesFrom(filePaths: readonly string[]): readonly PullRequestChangedFile[] {
    return filePaths.map(function (filePath) {
        return pullRequestChangedFileFactory.build({ path: filePath });
    });
}

function eslintUpdateChangedFiles(
    filePaths: readonly string[]
): ReadonlyMap<number, readonly PullRequestChangedFile[]> {
    return new Map([ [ 2, changedFilesFrom(filePaths) ] ]);
}

function engineForEslintUpdate(
    changedFilesByPullRequestMap: ReadonlyMap<number, readonly PullRequestChangedFile[]>
): ChangelogEngine {
    return createEngine({
        collectMergedPullRequests: fake.resolves([ eslintUpdatePullRequest() ]),
        filterPullRequestsByTargetFiles: fake.returns([ eslintUpdatePullRequest() ]),
        readPullRequestChangedFiles: fake.resolves(changedFilesByPullRequestMap),
        resolvePullRequestLabels: labelUpgradesById(new Set([ 2 ]))
    });
}

function substantiveManifestPackage(changelogSourceFiles: readonly string[]): ReleasePlanPackage {
    return releasePackage({
        releaseClassification: 'substantive',
        changelogSourceFiles,
        changelogDependencyNames: [],
        changelogDependencyUpdates: []
    });
}

async function generateSubstantiveManifestChangelog(
    engine: ChangelogEngine,
    changelogSourceFiles: readonly string[]
): ReturnType<typeof generateChangelogOutputs> {
    return generate([ substantiveManifestPackage(changelogSourceFiles) ], engine);
}

function registerDependencyEntryTests(): void {
    test('omits pull request links for substitution-only dependency entries', async function () {
        const engine = createEngine({});

        const changelog = await generate([ releasePackage({}) ], engine);

        assert.strictEqual(changelog.groupedMarkdown, '* Update @scope/pkg to 1.2.3');
        assert.strictEqual(changelog.packageMarkdownByName.get('pkg-a'), '* Update @scope/pkg to 1.2.3');
    });

    test('preserves pull request links for manifest dependency entries', async function () {
        const engine = createEngine({
            collectMergedPullRequests: fake.resolves([ { id: 1, title: 'Update React to v19' } ]),
            filterPullRequestsByTargetFiles: fake.returns([]),
            readPullRequestChangedFiles: fake.resolves(
                new Map([ [ 1, [ pullRequestChangedFileFactory.build({ path: 'package-lock.json' }) ] ] ])
            )
        });

        const changelog = await generateReactDependencyChangelog(engine);

        assert.strictEqual(changelog.groupedMarkdown, reactDependencyMarkdown);
    });

    test('keeps labeled manifest dependency pull requests for changed artifact dependencies', async function () {
        const engine = createEngine({
            collectMergedPullRequests: fake.resolves([ testPullRequest(1, 'Update React to v19') ]),
            filterPullRequestsByTargetFiles: fake.returns([]),
            readPullRequestChangedFiles: fake.resolves(changedFilesByPullRequest([ [ 1, 'package.json' ] ])),
            resolvePullRequestLabels: labelUpgradesById(new Set([ 1 ]))
        });

        const changelog = await generateReactDependencyChangelog(engine);

        assert.strictEqual(changelog.groupedMarkdown, reactDependencyMarkdown);
    });

    test('uses manifest dependency pull requests over other package pull requests', async function () {
        const engine = createEngine({
            collectMergedPullRequests: fake.resolves([
                { id: 1, title: 'Update React to v19' },
                { id: 2, title: 'Fix package' }
            ]),
            filterPullRequestsByTargetFiles: fake.returns([ { id: 2, title: 'Fix package' } ]),
            readPullRequestChangedFiles: fake.resolves(
                new Map([
                    [ 1, [ pullRequestChangedFileFactory.build({ path: 'package-lock.json' }) ] ],
                    [ 2, [ pullRequestChangedFileFactory.build({ path: 'source/pkg-a.ts' }) ] ]
                ])
            )
        });

        const changelog = await generateReactDependencyChangelog(engine);

        assert.strictEqual(changelog.groupedMarkdown, reactDependencyMarkdown);
    });

    test('renders dependency updates for substantive package changes', async function () {
        const engine = createEngine({
            collectMergedPullRequests: fake.resolves([
                { id: 1, title: 'Add feature' },
                { id: 2, title: 'Update React to v19' }
            ]),
            filterPullRequestsByTargetFiles: fake.returns([ { id: 1, title: 'Add feature' } ]),
            readPullRequestChangedFiles: fake.resolves(
                new Map([
                    [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/pkg-a.ts' }) ] ],
                    [ 2, [ pullRequestChangedFileFactory.build({ path: 'package-lock.json' }) ] ]
                ])
            ),
            resolvePullRequestLabels: fake(async function (options: ResolvePullRequestLabelsOptions) {
                return options.pullRequests.map(function (pullRequest): PullRequestWithLabel {
                    return {
                        ...pullRequest,
                        label: pullRequest.id === 2 ? 'upgrade' : 'bug'
                    };
                });
            })
        });

        const changelog = await generate(
            [
                releasePackage({
                    releaseClassification: 'substantive',
                    changelogDependencyNames: [ '@scope/pkg', 'react' ],
                    changelogDependencyUpdates: [
                        { name: '@scope/pkg', version: '1.2.3' },
                        { name: 'react', version: '19.0.0' }
                    ]
                })
            ],
            engine
        );

        assert.strictEqual(
            changelog.groupedMarkdown,
            [
                '* Add feature ([#1](https://github.com/owner/repo/pull/1))',
                '* Update @scope/pkg to 1.2.3',
                '* Update React to v19 ([#2](https://github.com/owner/repo/pull/2))'
            ]
                .join('\n')
        );
    });
}

function registerManifestDependencyFilterTests(): void {
    test('omits unrelated manifest-only dependency updates for substantive package changes', async function () {
        const engine = createEngine({
            collectMergedPullRequests: fake.resolves([
                testPullRequest(1, 'Add feature'),
                testPullRequest(2, 'Update dependency eslint to v10.9.0')
            ]),
            filterPullRequestsByTargetFiles: fake.returns([
                testPullRequest(1, 'Add feature'),
                testPullRequest(2, 'Update dependency eslint to v10.9.0')
            ]),
            readPullRequestChangedFiles: fake.resolves(changedFilesByPullRequest([
                [ 1, 'source/pkg-a.ts' ],
                [ 2, 'package.json' ]
            ])),
            resolvePullRequestLabels: labelUpgradesById(new Set([ 2 ]))
        });

        const changelog = await generate(
            [
                releasePackage({
                    releaseClassification: 'substantive',
                    changelogSourceFiles: [ 'package.json', 'source/pkg-a.ts' ],
                    changelogDependencyNames: [],
                    changelogDependencyUpdates: []
                })
            ],
            engine
        );

        assert.strictEqual(changelog.groupedMarkdown, '* Add feature ([#1](https://github.com/owner/repo/pull/1))');
    });

    test('keeps unrelated dependency updates that also touch package source files', async function () {
        const changelog = await generateSubstantiveManifestChangelog(
            engineForEslintUpdate(eslintUpdateChangedFiles([ 'package.json', 'source/pkg-a.ts' ])),
            [ 'package.json', 'source/pkg-a.ts' ]
        );

        assert.strictEqual(
            changelog.groupedMarkdown,
            '* Update dependency eslint to v10.9.0 ([#2](https://github.com/owner/repo/pull/2))'
        );
    });

    test('omits manifest dependency updates when remaining changed files are unrelated', async function () {
        const changelog = await generateSubstantiveManifestChangelog(
            engineForEslintUpdate(eslintUpdateChangedFiles([ 'package.json', 'docs/readme.md' ])),
            [ 'package.json', 'source/pkg-a.ts' ]
        );

        assert.partialDeepStrictEqual(changelog, {
            groupedMarkdown: '',
            packageNamesWithoutChangelogEntries: [ 'pkg-a' ]
        });
    });

    test('keeps dependency update pull requests when changed file data is unavailable', async function () {
        const changelog = await generateSubstantiveManifestChangelog(
            engineForEslintUpdate(new Map()),
            [ 'package.json' ]
        );

        assert.strictEqual(
            changelog.groupedMarkdown,
            '* Update dependency eslint to v10.9.0 ([#2](https://github.com/owner/repo/pull/2))'
        );
    });

    test('keeps manifest dependency pull requests without current dependency versions', async function () {
        const engine = createEngine({
            collectMergedPullRequests: fake.resolves([
                { id: 1, title: 'Add feature' },
                { id: 2, title: 'Remove React' }
            ]),
            filterPullRequestsByTargetFiles: fake.returns([ { id: 1, title: 'Add feature' } ]),
            readPullRequestChangedFiles: fake.resolves(
                new Map([
                    [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/pkg-a.ts' }) ] ],
                    [ 2, [ pullRequestChangedFileFactory.build({ path: 'package-lock.json' }) ] ]
                ])
            )
        });

        const changelog = await generate(
            [
                releasePackage({
                    releaseClassification: 'substantive',
                    changelogDependencyNames: [ 'react' ],
                    changelogDependencyUpdates: []
                })
            ],
            engine
        );

        assert.strictEqual(
            changelog.groupedMarkdown,
            [
                '* Add feature ([#1](https://github.com/owner/repo/pull/1))',
                '* Remove React ([#2](https://github.com/owner/repo/pull/2))'
            ]
                .join('\n')
        );
    });

    test('keeps labeled manifest dependency pull requests without current dependency versions', async function () {
        const engine = createEngine({
            collectMergedPullRequests: fake.resolves([ testPullRequest(2, 'Remove React') ]),
            filterPullRequestsByTargetFiles: fake.returns([]),
            readPullRequestChangedFiles: fake.resolves(changedFilesByPullRequest([ [ 2, 'package-lock.json' ] ])),
            resolvePullRequestLabels: labelUpgradesById(new Set([ 2 ]))
        });

        const changelog = await generate(
            [
                releasePackage({
                    releaseClassification: 'substantive',
                    changelogDependencyNames: [ 'react' ],
                    changelogDependencyUpdates: []
                })
            ],
            engine
        );

        assert.strictEqual(
            changelog.groupedMarkdown,
            '* Remove React ([#2](https://github.com/owner/repo/pull/2))'
        );
    });

    test('renders substantive dependency updates without attributed pull requests', async function () {
        const engine = createEngine({
            collectMergedPullRequests: fake.resolves([]),
            filterPullRequestsByTargetFiles: fake.returns([]),
            readPullRequestChangedFiles: fake.resolves(new Map()),
            resolvePullRequestLabels: fake.resolves([])
        });

        const changelog = await generate(
            [
                releasePackage({
                    releaseClassification: 'substantive'
                })
            ],
            engine
        );

        assert.partialDeepStrictEqual(changelog, {
            groupedMarkdown: '* Update @scope/pkg to 1.2.3',
            packageNamesWithoutChangelogEntries: []
        });
    });

    test('includes generated package manifest metadata pull requests for every attributed package', async function () {
        const pullRequests: readonly PullRequest[] = [ { id: 697, title: 'Align Node engines with CI' } ];
        const renderGroupedTargetChangelog = fake(function (input: RenderGroupedTargetChangelogMarkdownInput) {
            return renderPullRequests(input.targets.flatMap(function (target) {
                return target.mergedPullRequests;
            }));
        });
        const engine = createEngine({
            collectMergedPullRequests: fake.resolves(pullRequests),
            filterPullRequestsByTargetFiles: fake(function (input: FilterPullRequestsByTargetFilesInput) {
                return input.targetSourceFiles.includes('package.json') ? input.pullRequests : [];
            }),
            readPullRequestChangedFiles: fake.resolves(
                new Map([ [ 697, [ pullRequestChangedFileFactory.build({ path: 'package.json' }) ] ] ])
            ),
            renderGroupedTargetChangelog,
            resolvePullRequestLabels: fake(async function (options: ResolvePullRequestLabelsOptions) {
                return options.pullRequests.map(function (pullRequest): PullRequestWithLabel {
                    return { ...pullRequest, label: 'build' };
                });
            })
        });

        await generateChangelogOutputs({
            packages: [
                releasePackage({
                    name: 'pr-log',
                    nextVersion: '6.4.2',
                    releaseClassification: 'substantive',
                    changelogSourceFiles: [ 'package.json' ],
                    changelogDependencyNames: [],
                    changelogDependencyUpdates: []
                }),
                releasePackage({
                    name: '@pr-log/core',
                    nextVersion: '0.0.5',
                    releaseClassification: 'substantive',
                    changelogSourceFiles: [ 'package.json' ],
                    changelogDependencyNames: [],
                    changelogDependencyUpdates: []
                })
            ],
            prLogEngine: engine,
            changelogSourceFileRootsByPackageName: new Map(),
            githubRepo: 'enormora/pr-log',
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            explicitBaseRef: undefined,
            ignoredAttributionPaths: [],
            packageTagFormat: undefined,
            prLogConfig: {
                ...defaultPrLogConfig,
                validLabels: new Map([ ...defaultPrLogConfig.validLabels, [ 'build', 'Build-Related' ] ])
            },
            targetScopedLabelPattern: undefined
        });

        assert.deepStrictEqual(renderGroupedTargetChangelog.firstCall.args[0].targets, [
            {
                targetName: 'pr-log',
                unreleased: false,
                versionNumber: '6.4.2',
                mergedPullRequests: [ { id: 697, title: 'Align Node engines with CI', label: 'build' } ]
            },
            {
                targetName: '@pr-log/core',
                unreleased: false,
                versionNumber: '0.0.5',
                mergedPullRequests: [ { id: 697, title: 'Align Node engines with CI', label: 'build' } ]
            }
        ]);
    });
}

suite('packtory-changelog dependency updates', function () {
    registerDependencyEntryTests();
    registerManifestDependencyFilterTests();
});
