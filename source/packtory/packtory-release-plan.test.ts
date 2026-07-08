import assert from 'node:assert';
import vm from 'node:vm';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import { analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import {
    buildResultFor,
    packageProcessorCheckingStage,
    packageProcessorWithFailure,
    previousReleaseArtifactsFor,
    validatedReleaseConfigFor
} from '../test-libraries/release-orchestrator-fixtures.ts';
import {
    createPlanner,
    expectFirstPackage,
    expectPartialFailure,
    expectPlan,
    planFor,
    publishedBuildResultFor,
    resolvedPackagesFor,
    type ReleaseArtifactDescription,
    type ReleasePackageResolver
} from '../test-libraries/release-plan-test-support.ts';
import type { ResolveAndLinkFailure } from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

function registerPlanningTests(): void {
    test('runs dry-run release planning with staged publishing disabled', async function () {
        const validated = validatedReleaseConfigFor([ 'pkg-a' ]);
        const plan = createPlanner({
            packageNames: [ 'pkg-a' ],
            packageProcessor: packageProcessorCheckingStage(false)
        });

        const result = await plan(validated, async function () {
            return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
        });

        assert.strictEqual(result.isOk, true);
    });

    test('plans first publishes with all current artifact files marked as changed', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [ buildResultFor({ status: 'initial-version', version: '0.1.0' }) ],
            collectContents(_bundle, prefix) {
                assert.strictEqual(prefix, 'package');
                return [
                    { filePath: 'package/package.json', content: '{}', isExecutable: false },
                    { filePath: 'package/index.js', content: 'new', isExecutable: false },
                    { filePath: 'readme.md', content: 'readme', isExecutable: false }
                ];
            }
        });

        assert.deepStrictEqual(expectPlan(result).packages, [
            {
                name: 'pkg-a',
                previousVersion: undefined,
                nextVersion: '0.1.0',
                artifactState: 'first-publish',
                changed: true,
                previousGitHead: undefined,
                currentGitHead: undefined,
                latestRegistryMetadata: undefined,
                artifactFiles: [ 'index.js', 'package.json', 'readme.md' ],
                changedArtifactFiles: [ 'index.js', 'package.json', 'readme.md' ],
                releaseClassification: 'first-publish',
                sourceFiles: [ '/source/pkg-a.js' ],
                changelogDependencyNames: [],
                changelogSourceFiles: [ 'source/pkg-a.js' ]
            }
        ]);
    });

    test('plans changed packages from added, removed, and modified artifact paths', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [ publishedBuildResultFor() ],
            collectContents() {
                return [
                    { filePath: 'package/index.js', content: 'new', isExecutable: false },
                    { filePath: 'package/extra.js', content: 'extra', isExecutable: false }
                ];
            }
        });

        assert.deepStrictEqual(expectPlan(result).packages[0], {
            name: 'pkg-a',
            previousVersion: '1.0.0',
            nextVersion: '1.0.1',
            artifactState: 'changed',
            changed: true,
            latestRegistryMetadata: {
                version: '1.0.0',
                publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                gitHead: undefined
            },
            previousGitHead: undefined,
            currentGitHead: undefined,
            artifactFiles: [ 'extra.js', 'index.js' ],
            changedArtifactFiles: [ 'extra.js', 'index.js', 'removed.js' ],
            releaseClassification: 'substantive',
            sourceFiles: [ '/source/pkg-a.js' ],
            changelogDependencyNames: [],
            changelogSourceFiles: [ 'source/pkg-a.js' ]
        });
    });

    test('plans unchanged packages with current artifact files and no changed files', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [ publishedBuildResultFor('already-published') ],
            collectContents() {
                return [ { filePath: 'package/index.js', content: 'old', isExecutable: false } ];
            }
        });

        assert.deepStrictEqual(expectPlan(result).packages[0], {
            name: 'pkg-a',
            previousVersion: '1.0.0',
            nextVersion: '1.0.1',
            artifactState: 'unchanged',
            changed: false,
            latestRegistryMetadata: {
                version: '1.0.0',
                publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                gitHead: undefined
            },
            previousGitHead: undefined,
            currentGitHead: undefined,
            artifactFiles: [ 'index.js' ],
            changedArtifactFiles: [],
            releaseClassification: 'unchanged',
            sourceFiles: [ '/source/pkg-a.js' ],
            changelogDependencyNames: [],
            changelogSourceFiles: [ 'source/pkg-a.js' ]
        });
    });

    test('preserves succeeded package plans when a later dry-run publish fails', async function () {
        const validated = validatedReleaseConfigFor([ 'pkg-a', 'pkg-b' ]);
        const failure = new Error('publish failed');
        const plan = createPlanner({
            packageNames: [ 'pkg-a', 'pkg-b' ],
            packageProcessor: packageProcessorWithFailure([ buildResultFor({ packageName: 'pkg-a' }) ], failure),
            collectContents() {
                return [ { filePath: 'package/index.js', content: 'new', isExecutable: false } ];
            }
        });

        const partial = expectPartialFailure(
            await plan(validated, async function () {
                return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
            })
        );

        assert.strictEqual(partial.succeeded.length, 1);
        assert.strictEqual(partial.succeeded[0]?.name, 'pkg-a');
        assert.deepStrictEqual(partial.failures, [ failure ]);
    });
}

function registerMetadataTests(): void {
    test('plans previous and current git heads for published packages', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [
                buildResultFor({
                    previousReleaseArtifacts: previousReleaseArtifactsFor({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        gitHead: 'old-head',
                        files: [ { filePath: 'package/index.js', content: 'old', isExecutable: false } ]
                    })
                })
            ],
            currentGitHead: 'current-head',
            collectContents() {
                return [ { filePath: 'package/index.js', content: 'new', isExecutable: false } ];
            }
        });

        const pkg = expectFirstPackage(result);
        assert.partialDeepStrictEqual(pkg, {
            previousGitHead: 'old-head',
            currentGitHead: 'current-head',
            latestRegistryMetadata: {
                gitHead: 'old-head'
            }
        });
    });
}

function registerDependencyAttributionTests(): void {
    test('collects changed package manifest dependency names from previous and current artifacts', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [
                buildResultFor({
                    previousReleaseArtifacts: previousReleaseArtifactsFor({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        files: [
                            {
                                filePath: 'package/package.json',
                                content: JSON.stringify({ dependencies: { react: '^18.0.0', shared: '^1.0.0' } }),
                                isExecutable: false
                            }
                        ]
                    })
                })
            ],
            collectContents() {
                return [
                    {
                        filePath: 'package/package.json',
                        content: JSON.stringify({ dependencies: { react: '^19.0.0', shared: '^1.0.0' } }),
                        isExecutable: false
                    }
                ];
            },
            bundleContents: {
                'pkg-a': [
                    analyzedBundleResource('/source/pkg-a.js', { targetFilePath: 'package/index.js' }),
                    analyzedBundleResource('/source/unused.js', { targetFilePath: 'package/unused.js' })
                ]
            }
        });

        const pkg = expectFirstPackage(result);
        assert.partialDeepStrictEqual(pkg, {
            changelogDependencyNames: [ 'react' ],
            releaseClassification: 'dependency-only',
            changelogSourceFiles: [ 'source/pkg-a.js', 'source/unused.js' ]
        });
    });

    test('omits changed dependency names when the current artifact set has no manifest', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [
                buildResultFor({
                    previousReleaseArtifacts: previousReleaseArtifactsFor({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        files: [
                            {
                                filePath: 'package/package.json',
                                content: JSON.stringify({ dependencies: { react: '^18.0.0' } }),
                                isExecutable: false
                            }
                        ]
                    })
                })
            ],
            collectContents() {
                return [ { filePath: 'package/index.js', content: 'new', isExecutable: false } ];
            }
        });

        assert.deepStrictEqual(expectFirstPackage(result).changelogDependencyNames, []);
    });
}

function registerFailureTests(): void {
    test('returns a partial failure when building a package plan throws after publish succeeds', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [ buildResultFor() ],
            collectContents() {
                throw new Error('collect failed');
            }
        });

        const partial = expectPartialFailure(result);
        assert.deepStrictEqual(partial.succeeded, []);
        assert.match(partial.failures[0]?.message ?? '', /collect failed/u);
    });

    test('returns a partial failure when changelog source attribution fails', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [ buildResultFor() ],
            collectContents() {
                return [ { filePath: 'package/index.js', content: 'new', isExecutable: false } ];
            },
            fileManager: {
                async checkReadability() {
                    return { isReadable: false };
                },
                async readFile() {
                    return 'export {};\n//# sourceMappingURL=index.js.map';
                }
            }
        });

        const partial = expectPartialFailure(result);
        assert.deepStrictEqual(partial.succeeded, []);
        assert.match(partial.failures[0]?.message ?? '', /Source map "\/source\/index\.js\.map".*not readable/u);
    });

    test('returns a partial failure when a publish result has no matching analyzed bundle', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [ buildResultFor({ packageName: 'pkg-other' }) ],
            collectContents() {
                return [ { filePath: 'package/index.js', content: 'new', isExecutable: false } ];
            }
        });

        const partial = expectPartialFailure(result);
        assert.deepStrictEqual(partial.succeeded, []);
        assert.match(partial.failures[0]?.message ?? '', /Resolved package "pkg-other" is missing/u);
    });

    test('wraps non-Error plan failures in Error objects', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [ buildResultFor() ],
            collectContents() {
                return vm.runInNewContext("throw 'collect failed'") as readonly ReleaseArtifactDescription[];
            }
        });

        const partial = expectPartialFailure(result);
        assert.match(partial.failures[0]?.message ?? '', /collect failed/u);
    });

    test('falls back to plan-stage succeeded entries when publish and plan mapping both fail', async function () {
        const validated = validatedReleaseConfigFor([ 'pkg-a', 'pkg-b' ]);
        const plan = createPlanner({
            packageNames: [ 'pkg-a', 'pkg-b' ],
            packageProcessor: packageProcessorWithFailure(
                [ buildResultFor({ packageName: 'pkg-a' }) ],
                new Error('publish failed')
            ),
            collectContents() {
                throw new Error('collect failed');
            }
        });

        const partial = expectPartialFailure(
            await plan(validated, async function () {
                return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
            })
        );

        assert.deepStrictEqual(partial.succeeded, []);
        assert.match(partial.failures[0]?.message ?? '', /publish failed/u);
    });

    test('passes non-partial resolve failures through unchanged', async function () {
        const releasePlan = createPlanner({ packageNames: [] });
        const validated = validatedReleaseConfigFor([ 'pkg-a' ]);
        const stopWithConfigFailure = async function (): ReturnType<ReleasePackageResolver> {
            return Result.err<readonly ResolvedPackage[], ResolveAndLinkFailure>({
                type: 'config',
                issues: [ 'bad' ]
            });
        };

        const result = await releasePlan(validated, stopWithConfigFailure);

        if (result.isErr) {
            assert.strictEqual(result.error.type, 'config');
            return;
        }

        assert.fail('Expected an error result');
    });
}

function registerSourceFileTests(): void {
    test('attributes only selected sources for substantive artifact changes', async function () {
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [
                buildResultFor({
                    previousReleaseArtifacts: previousReleaseArtifactsFor({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        files: [
                            { filePath: 'package/index.js', content: 'old', isExecutable: false },
                            { filePath: 'package/unused.js', content: 'unchanged', isExecutable: false }
                        ]
                    })
                })
            ],
            collectContents() {
                return [
                    { filePath: 'package/index.js', content: 'new', isExecutable: false },
                    { filePath: 'package/unused.js', content: 'unchanged', isExecutable: false }
                ];
            },
            bundleContents: {
                'pkg-a': [
                    analyzedBundleResource('/source/pkg-a.js', { targetFilePath: 'package/index.js' }),
                    analyzedBundleResource('/source/unused.js', { targetFilePath: 'package/unused.js' })
                ]
            }
        });

        const pkg = expectFirstPackage(result);
        assert.partialDeepStrictEqual(pkg, {
            releaseClassification: 'substantive',
            changelogSourceFiles: [ 'source/pkg-a.js' ]
        });
    });

    test('excludes generated manifests and includes substituted and additional source files', async function () {
        const generatedManifest = {
            ...analyzedBundleResource('/source/package.json', { targetFilePath: 'package.json' }),
            isGeneratedManifest: true as const
        };
        const result = await planFor({
            packageNames: [ 'pkg-a' ],
            buildResults: [ buildResultFor() ],
            collectContents() {
                return [
                    { filePath: 'package/index.js', content: 'new', isExecutable: false },
                    { filePath: 'readme.md', content: 'readme', isExecutable: false }
                ];
            },
            bundleContents: {
                'pkg-a': [
                    generatedManifest,
                    analyzedBundleResource('/source/index.js', { targetFilePath: 'package/index.js' }),
                    analyzedBundleResource('/source/index.js', { targetFilePath: 'package/index.js' }),
                    analyzedBundleResource('/source/substituted.js', {
                        isSubstituted: true,
                        targetFilePath: 'package/index.js'
                    }),
                    analyzedBundleResource('/assets/readme.md', { targetFilePath: 'readme.md' })
                ]
            }
        });

        assert.deepStrictEqual(expectPlan(result).packages[0]?.sourceFiles, [
            '/assets/readme.md',
            '/source/index.js',
            '/source/substituted.js'
        ]);
        assert.deepStrictEqual(expectPlan(result).packages[0]?.changelogSourceFiles, [
            'assets/readme.md',
            'source/index.js',
            'source/substituted.js'
        ]);
    });

    test('maps partial resolve failures to release-plan partial failures with empty succeeded entries', async function () {
        const plan = createPlanner({ packageNames: [] });
        const failure = new Error('resolve failed');
        const validated = validatedReleaseConfigFor([ 'pkg-a' ]);

        const partial = expectPartialFailure(
            await plan(validated, async function () {
                return Result.err<readonly ResolvedPackage[], ResolveAndLinkFailure>({
                    type: 'partial',
                    error: { succeeded: [], failures: [ failure ] }
                });
            })
        );

        assert.partialDeepStrictEqual(partial, {
            succeeded: [],
            failures: [ failure ]
        });
    });
}

suite('packtory-release-plan', function () {
    registerPlanningTests();
    registerMetadataTests();
    registerDependencyAttributionTests();
    registerFailureTests();
    registerSourceFileTests();
});
