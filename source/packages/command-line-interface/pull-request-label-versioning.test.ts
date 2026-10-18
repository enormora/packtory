import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PullRequestLogEngine, PullRequestLogEngineOptions } from '../../changelog/pull-request-log.ts';
import type { PacktoryConfiguration } from '../../configuration/configuration.ts';
import type { VersionProvider } from '../../configuration/manual-versioning-settings.ts';
import { pullRequestChangedFileFactory } from '../../test-libraries/pull-request-log-fixtures.ts';
import { createPullRequestLabelVersionSourceResolver } from './pull-request-label-versioning.ts';

type ResolveBaseReferenceInput = Parameters<PullRequestLogEngine['resolveChangelogBaseReference']>[0];
type CollectPullRequestsInput = Parameters<PullRequestLogEngine['collectMergedPullRequests']>[0];
type ReadChangedFilesInput = Parameters<PullRequestLogEngine['readPullRequestChangedFiles']>[0];
type FilterPullRequestsInput = Parameters<PullRequestLogEngine['filterPullRequestsByTargetFiles']>[0];
type ResolveLabelsInput = Parameters<PullRequestLogEngine['resolvePullRequestLabels']>[0];
type TokenSourceInput = {
    readonly assertEngineOptions: (options: Readonly<PullRequestLogEngineOptions>) => void;
    readonly readEnvironmentVariable: (name: 'GH_TOKEN' | 'GITHUB_TOKEN') => string | undefined;
};

const source = { automatic: false, source: 'pull-request-labels' } as const;
const packtoryConfiguration: PacktoryConfiguration = {
    changelog: { pullRequestLog: { validLabels: { bug: 'Bug fixes', feature: 'Features' } } },
    packages: []
};

function createEngine(overrides: Partial<PullRequestLogEngine> = {}): PullRequestLogEngine {
    return {
        async resolveChangelogBaseReference(input: ResolveBaseReferenceInput) {
            assert.deepStrictEqual(input, {
                packageName: 'package',
                previousVersion: '1.0.0',
                previousGitHead: undefined,
                packageTagFormat: undefined,
                explicitBaseReference: undefined
            });
            return { reference: 'pkg@1.0.0' };
        },
        async collectMergedPullRequests(input: CollectPullRequestsInput) {
            assert.deepStrictEqual(input, { githubRepository: 'owner/repo', baseReference: 'pkg@1.0.0' });
            return [
                { identifier: 1, title: 'Fix bug' },
                { identifier: 2, title: 'Add feature' }
            ];
        },
        async readPullRequestChangedFiles(input: ReadChangedFilesInput) {
            assert.deepStrictEqual(
                input.pullRequests.map(function (pullRequest) {
                    return pullRequest.identifier;
                }),
                [ 1, 2 ]
            );
            return new Map([
                [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/index.ts' }) ] ],
                [ 2, [ pullRequestChangedFileFactory.build({ path: 'source/index.ts' }) ] ]
            ]);
        },
        filterPullRequestsByTargetFiles(input: FilterPullRequestsInput) {
            assert.partialDeepStrictEqual(input, {
                targetName: 'package',
                targetSourceFiles: [ 'source/index.ts' ],
                ignoredAttributionPaths: [ 'CHANGELOG.md' ]
            });
            return input.pullRequests;
        },
        async resolvePullRequestLabels(input: ResolveLabelsInput) {
            assert.deepStrictEqual(
                {
                    githubRepository: input.githubRepository,
                    targetName: input.targetName,
                    targetScopedLabelPattern: input.targetScopedLabelPattern,
                    ignoredLabels: input.configuration.ignoredLabels
                },
                {
                    githubRepository: 'owner/repo',
                    targetName: 'package',
                    targetScopedLabelPattern: undefined,
                    ignoredLabels: []
                }
            );
            return [
                { identifier: 1, title: 'Fix bug', label: 'bug' },
                { identifier: 2, title: 'Add feature', label: 'feature' }
            ];
        },
        ...overrides
    } as unknown as PullRequestLogEngine;
}

function createVersionProvider(
    engine: PullRequestLogEngine = createEngine(),
    configuration: PacktoryConfiguration = packtoryConfiguration
): VersionProvider {
    const resolver = createPullRequestLabelVersionSourceResolver({
        createPullRequestLogEngine() {
            return engine;
        },
        readEnvironmentVariable() {
            return undefined;
        },
        async readPackageInformation() {
            return { repository: 'https://github.com/owner/repo.git' };
        },
        workingDirectory: '/repo'
    });
    return resolver({ packageName: 'package', source, packtoryConfiguration: configuration });
}

async function resolveVersionWithTokenSource(input: TokenSourceInput): Promise<string> {
    const resolver = createPullRequestLabelVersionSourceResolver({
        createPullRequestLogEngine(options) {
            input.assertEngineOptions(options);
            return createEngine();
        },
        readEnvironmentVariable: input.readEnvironmentVariable,
        async readPackageInformation() {
            return { repository: 'https://github.com/owner/repo.git' };
        },
        workingDirectory: '/repo'
    });
    const provideVersion = resolver({ packageName: 'package', source, packtoryConfiguration });

    return provideVersion({
        packageName: 'package',
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
                    configuration: {
                        validLabels: options.configuration.validLabels,
                        ignoredLabels: [],
                        versionBumps: options.configuration.versionBumps,
                        dateFormat: undefined,
                        collapseRules: [],
                        labelLookupIntervalMilliseconds: 250,
                        maximumRateLimitRetryCount: 3
                    }
                });
                assert.deepStrictEqual(
                    {
                        bugLabel: options.configuration.validLabels.get('bug'),
                        majorBumpLabels: options.configuration.versionBumps.major,
                        minorBumpLabels: options.configuration.versionBumps.minor,
                        patchIncludesBug: options.configuration.versionBumps.patch.includes('bug')
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
                packageName: 'package',
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
                    return [ { identifier: 1, title: 'Break API', label: 'breaking' } ];
                }
            })
        );

        assert.strictEqual(
            await provideVersion({
                packageName: 'package',
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
                    return [ { identifier: 1, title: 'Fix bug', label: 'bug' } ];
                }
            }),
            { packages: [] }
        );

        assert.strictEqual(
            await provideVersion({
                packageName: 'package',
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
                packageName: 'package',
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
                async resolveChangelogBaseReference() {
                    return { reference: 'pkg@invalid' };
                },
                async collectMergedPullRequests() {
                    return [ { identifier: 1, title: 'Fix bug' } ];
                },
                async readPullRequestChangedFiles() {
                    return new Map([ [ 1, [ pullRequestChangedFileFactory.build({ path: 'source/index.ts' }) ] ] ]);
                },
                filterPullRequestsByTargetFiles(input) {
                    return input.pullRequests;
                },
                async resolvePullRequestLabels() {
                    return [ { identifier: 1, title: 'Fix bug', label: 'bug' } ];
                }
            })
        );

        await assert.rejects(
            async function () {
                await provideVersion({
                    packageName: 'package',
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
                async resolveChangelogBaseReference() {
                    throw new Error('must not resolve a base ref');
                }
            })
        );

        assert.strictEqual(
            await provideVersion({
                packageName: 'package',
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
