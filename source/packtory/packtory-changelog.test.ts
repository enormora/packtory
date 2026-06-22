import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type {
    FilterPullRequestsByTargetFilesInput,
    PrLogEngine,
    PullRequest,
    PullRequestWithLabel,
    RenderGroupedTargetChangelogMarkdownInput
} from '@pr-log/core';
import { generateChangelogOutputs } from './packtory-changelog.ts';
import type { ReleasePlanPackage } from './packtory-results.ts';

const validLabels = new Map([['bug', 'Bug Fixes']]);

function releasePackage(overrides: Partial<ReleasePlanPackage>): ReleasePlanPackage {
    return {
        name: 'pkg-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        changed: true,
        previousGitHead: undefined,
        currentGitHead: 'current-head',
        latestRegistryMetadata: undefined,
        artifactFiles: ['dist/index.js'],
        changedArtifactFiles: ['dist/index.js'],
        sourceFiles: ['source/pkg-a.ts'],
        changelogSourceFiles: ['source/pkg-a.ts'],
        ...overrides
    };
}

type EngineCalls = {
    readonly collectMergedPullRequests: SinonSpy;
    readonly filterPullRequestsByTargetFiles: SinonSpy<[FilterPullRequestsByTargetFilesInput], readonly PullRequest[]>;
    readonly readPullRequestChangedFiles: SinonSpy;
    readonly renderGroupedTargetChangelog: SinonSpy<[RenderGroupedTargetChangelogMarkdownInput], string>;
    readonly renderTargetChangelog: SinonSpy;
    readonly resolveChangelogBaseRef: SinonSpy;
    readonly resolveLatestSemverChangelogBaseRef: SinonSpy;
    readonly resolvePullRequestLabels: SinonSpy;
};

function createEngine(): { readonly engine: PrLogEngine; readonly calls: EngineCalls } {
    const pullRequests: readonly PullRequest[] = [
        { id: 1, title: 'Fix package' },
        { id: 2, title: 'Update changelog only' }
    ];
    const labeledPullRequests: readonly PullRequestWithLabel[] = [{ id: 1, title: 'Fix package', label: 'bug' }];
    const calls: EngineCalls = {
        collectMergedPullRequests: fake.resolves(pullRequests),
        filterPullRequestsByTargetFiles: fake((input: FilterPullRequestsByTargetFilesInput) => {
            return input.pullRequests.slice(0, 1);
        }),
        readPullRequestChangedFiles: fake.resolves(
            new Map([
                [1, ['source/pkg-a.ts']],
                [2, ['CHANGELOG.md']]
            ])
        ),
        renderGroupedTargetChangelog: fake((input: RenderGroupedTargetChangelogMarkdownInput) => {
            return input.targets
                .map((target) => {
                    return target.targetName;
                })
                .join('\n');
        }),
        renderTargetChangelog: fake((input: { readonly targetName: string }) => {
            return `# ${input.targetName}\n`;
        }),
        resolveChangelogBaseRef: fake(async (input: { readonly packageName: string }) => {
            return { ref: `${input.packageName}-base` };
        }),
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest-semver' }),
        resolvePullRequestLabels: fake.resolves(labeledPullRequests)
    };

    return { engine: calls as unknown as PrLogEngine, calls };
}

async function render(packages: readonly ReleasePlanPackage[], engine: PrLogEngine): Promise<string> {
    const changelog = await generateChangelogOutputs({
        packages,
        prLogEngine: engine,
        explicitBaseRef: undefined,
        githubRepo: 'owner/repo',
        packageInfo: {},
        packageTagFormat: undefined,
        currentDate: new Date('2026-06-13T00:00:00.000Z'),
        ignoredAttributionPaths: [],
        targetScopedLabelPattern: undefined,
        validLabels
    });
    return changelog.groupedMarkdown;
}

suite('packtory-changelog', function () {
    test('excludes unchanged packages from pr-log targets', async function () {
        const { engine, calls } = createEngine();

        await render([releasePackage({ changed: false, artifactState: 'unchanged' })], engine);

        assert.strictEqual(calls.collectMergedPullRequests.callCount, 0);
        assert.strictEqual(calls.renderGroupedTargetChangelog.callCount, 1);
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
            validLabels,
            ignoredLabels: [],
            pullRequests: [{ id: 1, title: 'Fix package' }],
            targetName: 'pkg-a',
            targetScopedLabelPattern: undefined
        });
        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, [
            {
                targetName: 'pkg-a',
                unreleased: false,
                versionNumber: '1.0.1',
                mergedPullRequests: [{ id: 1, title: 'Fix package', label: 'bug' }]
            },
            {
                targetName: 'pkg-b',
                unreleased: false,
                versionNumber: '0.1.0',
                mergedPullRequests: [{ id: 1, title: 'Fix package', label: 'bug' }]
            }
        ]);
    });

    test('filters pull requests with changelog source files and ignored changelog paths', async function () {
        const { engine, calls } = createEngine();

        await render(
            [
                releasePackage({
                    artifactFiles: ['dist/index.js'],
                    changedArtifactFiles: ['dist/index.js'],
                    sourceFiles: ['source/pkg-a.ts'],
                    changelogSourceFiles: ['source/pkg-a.ts', 'CHANGELOG.md']
                })
            ],
            engine
        );

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0], {
            targetName: 'pkg-a',
            targetSourceFiles: ['source/pkg-a.ts', 'CHANGELOG.md'],
            pullRequests: [
                { id: 1, title: 'Fix package' },
                { id: 2, title: 'Update changelog only' }
            ],
            changedFilesByPullRequest: new Map([
                [1, ['source/pkg-a.ts']],
                [2, ['CHANGELOG.md']]
            ]),
            ignoredAttributionPaths: ['CHANGELOG.md']
        });
    });

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
            packages: [releasePackage({ changelogSourceFiles: ['source/pkg-a.ts'] })],
            prLogEngine: emptyEngine,
            githubRepo: 'owner/repo',
            packageInfo: {},
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            explicitBaseRef: undefined,
            ignoredAttributionPaths: [],
            packageTagFormat: undefined,
            targetScopedLabelPattern: undefined,
            validLabels
        });

        assert.deepStrictEqual(calls.renderGroupedTargetChangelog.firstCall.args[0].targets, []);
        assert.deepStrictEqual(changelog.packageNamesWithoutChangelogEntries, ['pkg-a']);
        assert.deepStrictEqual(changelog.packageMarkdownByName, new Map());
        assert.strictEqual(renderTargetChangelog.callCount, 0);
    });

    test('uses the package base-ref resolver when a package has a previous git head but no previous version', async function () {
        const { engine, calls } = createEngine();

        await render([releasePackage({ previousVersion: undefined, previousGitHead: 'previous-head' })], engine);

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

        await render([releasePackage({ changelogSourceFiles: ['docs/CHANGELOG.md.bak'] })], engine);

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0].ignoredAttributionPaths, []);
    });

    test('ignores nested CHANGELOG.md files', async function () {
        const { engine, calls } = createEngine();

        await render([releasePackage({ changelogSourceFiles: ['docs/CHANGELOG.md'] })], engine);

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0].ignoredAttributionPaths, [
            'docs/CHANGELOG.md'
        ]);
    });

    test('adds generated changelog paths to ignored attribution paths', async function () {
        const { engine, calls } = createEngine();

        await generateChangelogOutputs({
            packages: [releasePackage({ changelogSourceFiles: ['source/pkg-a.ts'] })],
            prLogEngine: engine,
            githubRepo: 'owner/repo',
            packageInfo: {},
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            explicitBaseRef: undefined,
            ignoredAttributionPaths: ['docs/generated.md'],
            packageTagFormat: undefined,
            targetScopedLabelPattern: undefined,
            validLabels
        });

        assert.deepStrictEqual(calls.filterPullRequestsByTargetFiles.firstCall.args[0].ignoredAttributionPaths, [
            'docs/generated.md'
        ]);
    });

    test('passes configured base-ref and label options to pr-log', async function () {
        const { engine, calls } = createEngine();

        await generateChangelogOutputs({
            packages: [releasePackage({ previousVersion: undefined, previousGitHead: undefined })],
            prLogEngine: engine,
            explicitBaseRef: 'release-base',
            githubRepo: 'owner/repo',
            packageInfo: {},
            packageTagFormat: 'pkg/{packageName}/v{version}',
            currentDate: new Date('2026-06-13T00:00:00.000Z'),
            ignoredAttributionPaths: [],
            targetScopedLabelPattern: 'scope:{targetName}:{label}',
            validLabels
        });

        assert.strictEqual(calls.resolveLatestSemverChangelogBaseRef.callCount, 0);
        assert.deepStrictEqual(calls.resolveChangelogBaseRef.firstCall.args[0], {
            packageName: 'pkg-a',
            previousVersion: undefined,
            previousGitHead: undefined,
            packageTagFormat: 'pkg/{packageName}/v{version}',
            explicitBaseRef: 'release-base'
        });
        const labelInput = calls.resolvePullRequestLabels.firstCall.args[0] as {
            readonly targetScopedLabelPattern: string;
        };
        assert.strictEqual(labelInput.targetScopedLabelPattern, 'scope:{targetName}:{label}');
    });
});
