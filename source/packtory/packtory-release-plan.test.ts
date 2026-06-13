import assert from 'node:assert';
import vm from 'node:vm';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import type { ValidConfigResult } from '../config/validation.ts';
import { analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import {
    buildResultFor,
    createReleaseTestDependencies,
    packageProcessorCheckingStage,
    packageProcessorWithFailure,
    previousReleaseArtifactsFor,
    resolvedPackagesFor as sharedResolvedPackagesFor,
    validatedReleaseConfigFor,
    type ReleaseFileCollection
} from '../test-libraries/release-orchestrator-fixtures.ts';
import { createPlanReleaseAgainstLatestPublishedValidated } from './packtory-release-plan.ts';
import type { ReleasePlanResult, ResolveAndLinkFailure } from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

type ReleaseTestDependencies = ReturnType<typeof createReleaseTestDependencies>;
type BuildAndPublishResult = Awaited<ReturnType<ReleaseTestDependencies['packageProcessor']['tryBuildAndPublish']>>;
type PackageProcessor = ReleaseTestDependencies['packageProcessor'];
type FileCollection = ReleaseFileCollection;
type ReleasePlanFileManager = ReleaseTestDependencies['fileManager'];

function createPlanner(spec: {
    readonly packageNames: readonly string[];
    readonly buildResults?: readonly BuildAndPublishResult[];
    readonly collectContents?: FileCollection;
    readonly currentGitHead?: string | undefined;
    readonly fileManager?: ReleasePlanFileManager | undefined;
    readonly packageProcessor?: PackageProcessor;
    readonly repositoryFolder?: string | undefined;
}) {
    return createPlanReleaseAgainstLatestPublishedValidated(createReleaseTestDependencies(spec));
}

function resolvedPackagesFor(
    validated: ValidConfigResult,
    bundleContents: Readonly<Record<string, readonly ReturnType<typeof analyzedBundleResource>[]>> = {}
): readonly ResolvedPackage[] {
    return sharedResolvedPackagesFor(validated, {
        bundleContents,
        defaultContents(packageName) {
            return [analyzedBundleResource(`/source/${packageName}.js`)];
        }
    });
}

async function planFor(spec: {
    readonly packageNames: readonly string[];
    readonly buildResults: readonly BuildAndPublishResult[];
    readonly collectContents: FileCollection;
    readonly bundleContents?: Readonly<Record<string, readonly ReturnType<typeof analyzedBundleResource>[]>>;
    readonly currentGitHead?: string | undefined;
    readonly fileManager?: ReleasePlanFileManager | undefined;
    readonly repositoryFolder?: string | undefined;
}): Promise<ReleasePlanResult> {
    const validated = validatedReleaseConfigFor(spec.packageNames);
    const plan = createPlanner({
        packageNames: spec.packageNames,
        buildResults: spec.buildResults,
        collectContents: spec.collectContents,
        currentGitHead: spec.currentGitHead,
        fileManager: spec.fileManager,
        repositoryFolder: spec.repositoryFolder
    });

    return plan(validated, async () => {
        return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(
            resolvedPackagesFor(validated, spec.bundleContents)
        );
    });
}

function publishedBuildResultFor(status: BuildAndPublishResult['status'] = 'new-version'): BuildAndPublishResult {
    return buildResultFor({
        status,
        packageName: 'pkg-a',
        previousReleaseArtifacts: previousReleaseArtifactsFor({
            version: '1.0.0',
            publishedAt: new Date('2026-05-01T00:00:00.000Z'),
            files: [
                { filePath: 'package/index.js', content: 'old', isExecutable: false },
                { filePath: 'package/removed.js', content: 'removed', isExecutable: false }
            ]
        })
    });
}

function expectPlan(result: ReleasePlanResult) {
    if (result.isErr) {
        assert.fail(`Expected release plan, got ${result.error.type}`);
    }
    return result.value;
}

function expectPartialFailure(result: ReleasePlanResult) {
    if (result.isOk || result.error.type !== 'partial') {
        assert.fail('Expected a partial release-plan failure');
    }
    return result.error;
}

suite('packtory-release-plan', function () {
    test('runs dry-run release planning with staged publishing disabled', async function () {
        const validated = validatedReleaseConfigFor(['pkg-a']);
        const plan = createPlanner({
            packageNames: ['pkg-a'],
            packageProcessor: packageProcessorCheckingStage(false)
        });

        const result = await plan(validated, async () => {
            return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
        });

        assert.strictEqual(result.isOk, true);
    });

    test('plans first publishes with all current artifact files marked as changed', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor({ status: 'initial-version', version: '0.1.0' })],
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
                artifactFiles: ['index.js', 'package.json', 'readme.md'],
                changedArtifactFiles: ['index.js', 'package.json', 'readme.md'],
                sourceFiles: ['/source/pkg-a.js'],
                changelogSourceFiles: ['source/pkg-a.js']
            }
        ]);
    });

    test('plans changed packages from added, removed, and modified artifact paths', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [publishedBuildResultFor()],
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
            artifactFiles: ['extra.js', 'index.js'],
            changedArtifactFiles: ['extra.js', 'index.js', 'removed.js'],
            sourceFiles: ['/source/pkg-a.js'],
            changelogSourceFiles: ['source/pkg-a.js']
        });
    });

    test('plans unchanged packages with current artifact files and no changed files', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [publishedBuildResultFor('already-published')],
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'old', isExecutable: false }];
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
            artifactFiles: ['index.js'],
            changedArtifactFiles: [],
            sourceFiles: ['/source/pkg-a.js'],
            changelogSourceFiles: ['source/pkg-a.js']
        });
    });

    test('preserves succeeded package plans when a later dry-run publish fails', async function () {
        const validated = validatedReleaseConfigFor(['pkg-a', 'pkg-b']);
        const failure = new Error('publish failed');
        const plan = createPlanner({
            packageNames: ['pkg-a', 'pkg-b'],
            packageProcessor: packageProcessorWithFailure([buildResultFor({ packageName: 'pkg-a' })], failure),
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'new', isExecutable: false }];
            }
        });

        const partial = expectPartialFailure(
            await plan(validated, async () => {
                return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
            })
        );

        assert.strictEqual(partial.succeeded.length, 1);
        assert.strictEqual(partial.succeeded[0]?.name, 'pkg-a');
        assert.deepStrictEqual(partial.failures, [failure]);
    });

    test('plans previous and current git heads for published packages', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [
                buildResultFor({
                    previousReleaseArtifacts: previousReleaseArtifactsFor({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        gitHead: 'old-head',
                        files: [{ filePath: 'package/index.js', content: 'old', isExecutable: false }]
                    })
                })
            ],
            currentGitHead: 'current-head',
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'new', isExecutable: false }];
            }
        });

        const [pkg] = expectPlan(result).packages;
        assert.ok(pkg);
        assert.strictEqual(pkg.previousGitHead, 'old-head');
        assert.strictEqual(pkg.currentGitHead, 'current-head');
        assert.strictEqual(pkg.latestRegistryMetadata?.gitHead, 'old-head');
    });

    test('returns a partial failure when building a package plan throws after publish succeeds', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor()],
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
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor()],
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'new', isExecutable: false }];
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
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor({ packageName: 'pkg-other' })],
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'new', isExecutable: false }];
            }
        });

        const partial = expectPartialFailure(result);
        assert.deepStrictEqual(partial.succeeded, []);
        assert.match(partial.failures[0]?.message ?? '', /Analyzed bundle for package "pkg-other" is missing/u);
    });

    test('wraps non-Error plan failures in Error objects', async function () {
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor()],
            collectContents() {
                return vm.runInNewContext("throw 'collect failed'") as readonly {
                    readonly content: string;
                    readonly filePath: string;
                    readonly isExecutable: false;
                }[];
            }
        });

        const partial = expectPartialFailure(result);
        assert.match(partial.failures[0]?.message ?? '', /collect failed/u);
    });

    test('falls back to plan-stage succeeded entries when publish and plan mapping both fail', async function () {
        const validated = validatedReleaseConfigFor(['pkg-a', 'pkg-b']);
        const plan = createPlanner({
            packageNames: ['pkg-a', 'pkg-b'],
            packageProcessor: packageProcessorWithFailure(
                [buildResultFor({ packageName: 'pkg-a' })],
                new Error('publish failed')
            ),
            collectContents() {
                throw new Error('collect failed');
            }
        });

        const partial = expectPartialFailure(
            await plan(validated, async () => {
                return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
            })
        );

        assert.deepStrictEqual(partial.succeeded, []);
        assert.match(partial.failures[0]?.message ?? '', /publish failed/u);
    });

    test('passes non-partial resolve failures through unchanged', async function () {
        const releasePlan = createPlanner({ packageNames: [] });
        const validated = validatedReleaseConfigFor(['pkg-a']);
        const stopWithConfigFailure = async () => {
            return Result.err<readonly ResolvedPackage[], ResolveAndLinkFailure>({
                type: 'config',
                issues: ['bad']
            });
        };

        const result = await releasePlan(validated, stopWithConfigFailure);

        if (result.isErr) {
            assert.strictEqual(result.error.type, 'config');
            return;
        }

        assert.fail('Expected an error result');
    });

    test('excludes generated manifests and includes substituted and additional source files', async function () {
        const generatedManifest = {
            ...analyzedBundleResource('/source/package.json', { targetFilePath: 'package.json' }),
            isGeneratedManifest: true as const
        };
        const result = await planFor({
            packageNames: ['pkg-a'],
            buildResults: [buildResultFor()],
            collectContents() {
                return [{ filePath: 'package/index.js', content: 'new', isExecutable: false }];
            },
            bundleContents: {
                'pkg-a': [
                    generatedManifest,
                    analyzedBundleResource('/source/index.js'),
                    analyzedBundleResource('/source/index.js'),
                    analyzedBundleResource('/source/substituted.js', { isSubstituted: true }),
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
        const validated = validatedReleaseConfigFor(['pkg-a']);

        const partial = expectPartialFailure(
            await plan(validated, async () => {
                return Result.err<readonly ResolvedPackage[], ResolveAndLinkFailure>({
                    type: 'partial',
                    error: { succeeded: [], failures: [failure] }
                });
            })
        );

        assert.deepStrictEqual(partial.succeeded, []);
        assert.deepStrictEqual(partial.failures, [failure]);
    });
});
