import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PrLogEngine, PrLogEngineOptions } from '@pr-log/core';
import type { PacktoryConfig } from '../../config/config.ts';
import type { VersionProvider } from '../../config/manual-versioning-settings.ts';
import { createPullRequestLabelVersionSourceResolver } from './pull-request-label-versioning.ts';

type ResolveBaseRefInput = Parameters<PrLogEngine['resolveChangelogBaseRef']>[0];
type CollectPullRequestsInput = Parameters<PrLogEngine['collectMergedPullRequests']>[0];
type ReadChangedFilesInput = Parameters<PrLogEngine['readPullRequestChangedFiles']>[0];
type FilterPullRequestsInput = Parameters<PrLogEngine['filterPullRequestsByTargetFiles']>[0];
type ResolveLabelsInput = Parameters<PrLogEngine['resolvePullRequestLabels']>[0];
type TokenSourceInput = {
    readonly assertEngineOptions: (options: Readonly<PrLogEngineOptions>) => void;
    readonly readEnvironmentVariable: (name: 'GH_TOKEN' | 'GITHUB_TOKEN') => string | undefined;
};

const source = { automatic: false, source: 'pull-request-labels' } as const;
const packtoryConfig: PacktoryConfig = {
    changelog: { prLog: { validLabels: { bug: 'Bug fixes', feature: 'Features' } } },
    packages: []
};

function createEngine(overrides: Partial<PrLogEngine> = {}): PrLogEngine {
    return {
        async resolveChangelogBaseRef(input: ResolveBaseRefInput) {
            assert.deepStrictEqual(input, {
                packageName: 'pkg',
                previousVersion: '1.0.0',
                previousGitHead: undefined,
                packageTagFormat: undefined,
                explicitBaseRef: undefined
            });
            return { ref: 'pkg@1.0.0' };
        },
        async collectMergedPullRequests(input: CollectPullRequestsInput) {
            assert.deepStrictEqual(input, { githubRepo: 'owner/repo', baseRef: 'pkg@1.0.0' });
            return [
                { id: 1, title: 'Fix bug' },
                { id: 2, title: 'Add feature' }
            ];
        },
        async readPullRequestChangedFiles(input: ReadChangedFilesInput) {
            assert.deepStrictEqual(
                input.pullRequests.map(function (pullRequest) {
                    return pullRequest.id;
                }),
                [ 1, 2 ]
            );
            return new Map([
                [ 1, [ 'source/index.ts' ] ],
                [ 2, [ 'source/index.ts' ] ]
            ]);
        },
        filterPullRequestsByTargetFiles(input: FilterPullRequestsInput) {
            assert.partialDeepStrictEqual(input, {
                targetName: 'pkg',
                targetSourceFiles: [ 'source/index.ts' ],
                ignoredAttributionPaths: [ 'CHANGELOG.md' ]
            });
            return input.pullRequests;
        },
        async resolvePullRequestLabels(input: ResolveLabelsInput) {
            assert.deepStrictEqual(
                {
                    githubRepo: input.githubRepo,
                    targetName: input.targetName,
                    targetScopedLabelPattern: input.targetScopedLabelPattern,
                    ignoredLabels: input.config.ignoredLabels
                },
                {
                    githubRepo: 'owner/repo',
                    targetName: 'pkg',
                    targetScopedLabelPattern: undefined,
                    ignoredLabels: []
                }
            );
            return [
                { id: 1, title: 'Fix bug', label: 'bug' },
                { id: 2, title: 'Add feature', label: 'feature' }
            ];
        },
        ...overrides
    } as unknown as PrLogEngine;
}

function createVersionProvider(
    engine: PrLogEngine = createEngine(),
    config: PacktoryConfig = packtoryConfig
): VersionProvider {
    const resolver = createPullRequestLabelVersionSourceResolver({
        createPrLogEngine() {
            return engine;
        },
        readEnvironmentVariable() {
            return undefined;
        },
        async readPackageInfo() {
            return { repository: 'https://github.com/owner/repo.git' };
        },
        workingDirectory: '/repo'
    });
    return resolver({ packageName: 'pkg', source, packtoryConfig: config });
}

async function resolveVersionWithTokenSource(input: TokenSourceInput): Promise<string> {
    const resolver = createPullRequestLabelVersionSourceResolver({
        createPrLogEngine(options) {
            input.assertEngineOptions(options);
            return createEngine();
        },
        readEnvironmentVariable: input.readEnvironmentVariable,
        async readPackageInfo() {
            return { repository: 'https://github.com/owner/repo.git' };
        },
        workingDirectory: '/repo'
    });
    const provideVersion = resolver({ packageName: 'pkg', source, packtoryConfig });

    return provideVersion({
        packageName: 'pkg',
        currentVersion: '1.0.0',
        targetSourceFiles: [ 'source/index.ts' ],
        ignoredAttributionPaths: [ 'CHANGELOG.md' ],
        registrySettings: {},
        stage: false
    });
}

suite('pull-request-label-version-source', function () {
    test('creates pr-log with GitHub token and retry settings', async function () {
        const result = await resolveVersionWithTokenSource({
            assertEngineOptions(options) {
                assert.deepStrictEqual(options, {
                    githubToken: 'gh-token',
                    workingDirectory: '/repo',
                    config: {
                        validLabels: options.config.validLabels,
                        ignoredLabels: [],
                        versionBumps: options.config.versionBumps,
                        dateFormat: undefined,
                        collapseRules: [],
                        labelLookupIntervalMilliseconds: 250,
                        maximumRateLimitRetryCount: 3
                    }
                });
                assert.deepStrictEqual(
                    {
                        bugLabel: options.config.validLabels.get('bug'),
                        majorBumpLabels: options.config.versionBumps.major,
                        minorBumpLabels: options.config.versionBumps.minor,
                        patchIncludesBug: options.config.versionBumps.patch.includes('bug')
                    },
                    {
                        bugLabel: 'Bug fixes',
                        majorBumpLabels: [ 'breaking' ],
                        minorBumpLabels: [ 'feature' ],
                        patchIncludesBug: true
                    }
                );
            },
            readEnvironmentVariable(name) {
                return name === 'GH_TOKEN' ? 'gh-token' : undefined;
            }
        });

        assert.strictEqual(result, '1.1.0');
    });

    test('uses GITHUB_TOKEN when GH_TOKEN is missing', async function () {
        const result = await resolveVersionWithTokenSource({
            assertEngineOptions(options) {
                assert.strictEqual(options.githubToken, 'github-token');
            },
            readEnvironmentVariable(name) {
                return name === 'GITHUB_TOKEN' ? 'github-token' : undefined;
            }
        });

        assert.strictEqual(result, '1.1.0');
    });

    test('selects the highest pull request label bump', async function () {
        const provideVersion = createVersionProvider();

        assert.strictEqual(
            await provideVersion({
                packageName: 'pkg',
                currentVersion: '1.0.0',
                targetSourceFiles: [ 'source/index.ts' ],
                ignoredAttributionPaths: [ 'CHANGELOG.md' ],
                registrySettings: {},
                stage: false
            }),
            '1.1.0'
        );
    });

    test('uses breaking labels for major bumps', async function () {
        const provideVersion = createVersionProvider(
            createEngine({
                async resolvePullRequestLabels() {
                    return [ { id: 1, title: 'Break API', label: 'breaking' } ];
                }
            })
        );

        assert.strictEqual(
            await provideVersion({
                packageName: 'pkg',
                currentVersion: '1.0.0',
                targetSourceFiles: [ 'source/index.ts' ],
                ignoredAttributionPaths: [ 'CHANGELOG.md' ],
                registrySettings: {},
                stage: false
            }),
            '2.0.0'
        );
    });

    test('uses default labels when changelog labels are not configured', async function () {
        const provideVersion = createVersionProvider(
            createEngine({
                async resolvePullRequestLabels() {
                    return [ { id: 1, title: 'Fix bug', label: 'bug' } ];
                }
            }),
            { packages: [] }
        );

        assert.strictEqual(
            await provideVersion({
                packageName: 'pkg',
                currentVersion: '1.0.0',
                targetSourceFiles: [ 'source/index.ts' ],
                ignoredAttributionPaths: [ 'CHANGELOG.md' ],
                registrySettings: {},
                stage: false
            }),
            '1.0.1'
        );
    });

    test('keeps the current version when no attributed pull request has a bump label', async function () {
        const provideVersion = createVersionProvider(
            createEngine({
                async resolvePullRequestLabels() {
                    return [];
                }
            })
        );

        assert.strictEqual(
            await provideVersion({
                packageName: 'pkg',
                currentVersion: '1.0.0',
                targetSourceFiles: [ 'source/index.ts' ],
                ignoredAttributionPaths: [ 'CHANGELOG.md' ],
                registrySettings: {},
                stage: false
            }),
            '1.0.0'
        );
    });

    test('throws when the current version cannot be incremented', async function () {
        const provideVersion = createVersionProvider(
            createEngine({
                async resolveChangelogBaseRef() {
                    return { ref: 'pkg@invalid' };
                },
                async collectMergedPullRequests() {
                    return [ { id: 1, title: 'Fix bug' } ];
                },
                async readPullRequestChangedFiles() {
                    return new Map([ [ 1, [ 'source/index.ts' ] ] ]);
                },
                filterPullRequestsByTargetFiles(input) {
                    return input.pullRequests;
                },
                async resolvePullRequestLabels() {
                    return [ { id: 1, title: 'Fix bug', label: 'bug' } ];
                }
            })
        );

        await assert.rejects(
            async function () {
                await provideVersion({
                    packageName: 'pkg',
                    currentVersion: 'invalid',
                    targetSourceFiles: [ 'source/index.ts' ],
                    ignoredAttributionPaths: [ 'CHANGELOG.md' ],
                    registrySettings: {},
                    stage: false
                });
            },
            { message: 'Failed to increment version "invalid"' }
        );
    });

    test('returns the initial version when the package is unpublished', async function () {
        const provideVersion = createVersionProvider(
            createEngine({
                async resolveChangelogBaseRef() {
                    throw new Error('must not resolve a base ref');
                }
            })
        );

        assert.strictEqual(
            await provideVersion({
                packageName: 'pkg',
                currentVersion: undefined,
                targetSourceFiles: [ 'source/index.ts' ],
                ignoredAttributionPaths: [],
                registrySettings: {},
                stage: false
            }),
            '0.0.1'
        );
    });
});
