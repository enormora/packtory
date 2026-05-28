import assert from 'node:assert';
import vm from 'node:vm';
import { suite, test } from 'mocha';
import { Maybe, Result } from 'true-myth';
import { validateConfig, type ValidConfigResult } from '../config/validation.ts';
import { createIteratingScheduler } from '../test-libraries/iterating-scheduler.ts';
import { analyzedBundle, versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import {
    createAnalyzeReleaseAgainstLatestPublishedValidated,
    type ReleaseAnalysisOrchestratorDependencies
} from './packtory-release-analysis.ts';
import type { ReleaseAnalysisResult, ResolveAndLinkFailure } from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

type BuildAndPublishResult = Awaited<
    ReturnType<ReleaseAnalysisOrchestratorDependencies['packageProcessor']['tryBuildAndPublish']>
>;
type PackageProcessor = ReleaseAnalysisOrchestratorDependencies['packageProcessor'];
type FileCollection = ReleaseAnalysisOrchestratorDependencies['artifactsBuilder']['collectContents'];
const noPublicationOutcome = { type: 'none' } as const;

function validatedConfigFor(packageNames: readonly string[]): ValidConfigResult {
    const result = validateConfig({
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        packages: packageNames.map((name) => {
            return {
                mainPackageJson: { type: 'module' },
                name,
                publishSettings: { access: 'public' },
                roots: { main: { js: `source/${name}.js` } },
                sourcesFolder: 'source'
            };
        })
    });

    if (result.isErr) {
        assert.fail(`Expected config to validate: ${result.error.join(', ')}`);
    }

    return result.value;
}

function packageProcessorFor(
    buildResults: readonly BuildAndPublishResult[],
    onMissingResult: () => never
): PackageProcessor {
    let invocation = 0;

    return {
        async build() {
            throw new Error('build() should not be called in release-analysis tests');
        },
        async buildAndPublish() {
            throw new Error('buildAndPublish() should not be called in release-analysis dry runs');
        },
        async resolveAndLink() {
            throw new Error('resolveAndLink() should not be called in release-analysis tests');
        },
        async tryBuildAndPublish() {
            const result = buildResults[invocation];
            invocation += 1;
            if (result === undefined) {
                return onMissingResult();
            }

            return result;
        }
    };
}

function packageProcessorWith(buildResults: readonly BuildAndPublishResult[]): PackageProcessor {
    return packageProcessorFor(buildResults, () => {
        throw new Error('Missing build result fixture');
    });
}

function packageProcessorWithFailure(buildResults: readonly BuildAndPublishResult[], failure: Error): PackageProcessor {
    return packageProcessorFor(buildResults, () => {
        throw failure;
    });
}

function buildResultFor(
    overrides: Partial<BuildAndPublishResult> & { readonly packageName?: string } = {}
): BuildAndPublishResult {
    const packageName = overrides.packageName ?? 'pkg-a';

    return {
        status: 'new-version',
        publication: noPublicationOutcome,
        bundle: versionedBundleWithManifest({
            name: packageName,
            version: '1.0.1',
            packageJson: { name: packageName, version: '1.0.1' }
        }),
        extraFiles: [],
        previousReleaseArtifacts: Maybe.nothing(),
        ...overrides
    };
}

const progressBroadcaster: ReleaseAnalysisOrchestratorDependencies['progressBroadcaster'] = {
    consumer: {
        off() {
            return undefined;
        },
        on() {
            return undefined;
        }
    },
    provider: {
        emit() {
            return undefined;
        },
        hasSubscribers() {
            return false;
        }
    }
};

function createAnalyzer(spec: {
    readonly packageNames: readonly string[];
    readonly buildResults?: readonly BuildAndPublishResult[];
    readonly collectContents?: ReleaseAnalysisOrchestratorDependencies['artifactsBuilder']['collectContents'];
    readonly packageProcessor?: PackageProcessor;
}) {
    const dependencies: ReleaseAnalysisOrchestratorDependencies = {
        artifactsBuilder: {
            collectContents:
                spec.collectContents ??
                (() => {
                    return [];
                })
        },
        packageProcessor: spec.packageProcessor ?? packageProcessorWith(spec.buildResults ?? []),
        progressBroadcaster,
        scheduler: createIteratingScheduler(spec.packageNames)
    };

    return createAnalyzeReleaseAgainstLatestPublishedValidated(dependencies);
}

function expectPartialFailure(result: ReleaseAnalysisResult) {
    if (result.isOk || result.error.type !== 'partial') {
        assert.fail('Expected a partial release-analysis failure');
    }

    return result.error;
}

function resolvedPackagesFor(validated: ValidConfigResult): readonly ResolvedPackage[] {
    return validated.packtoryConfig.packages.map((packageConfig) => {
        const resolvedPackage: ResolvedPackage = {
            name: packageConfig.name,
            analyzedBundle: analyzedBundle({ name: packageConfig.name }),
            resolveOptions: {
                name: packageConfig.name,
                exportPackageJson: packageConfig.exportPackageJson,
                roots: packageConfig.roots,
                surface: undefined,
                sourcesFolder: packageConfig.sourcesFolder ?? 'source',
                includeSourceMapFiles: packageConfig.includeSourceMapFiles ?? false,
                additionalFiles: packageConfig.additionalFiles ?? [],
                mainPackageJson: packageConfig.mainPackageJson ?? { type: 'module' },
                additionalPackageJsonAttributes: packageConfig.additionalPackageJsonAttributes ?? {},
                allowMutableSpecifiers: [],
                deadCodeElimination: packageConfig.deadCodeElimination,
                bundleDependencies: [],
                bundlePeerDependencies: []
            }
        };

        return resolvedPackage;
    });
}

function publishedBuildResultFor(status: BuildAndPublishResult['status'] = 'new-version'): BuildAndPublishResult {
    return buildResultFor({
        status,
        packageName: 'pkg-a',
        previousReleaseArtifacts: Maybe.just({
            version: '1.0.0',
            publishedAt: new Date('2026-05-01T00:00:00.000Z'),
            files: [{ filePath: 'package.json', content: '{"name":"pkg-a","version":"1.0.0"}', isExecutable: false }]
        })
    });
}

async function analyzePublishedBuildResult(spec: {
    readonly collectContents: ReleaseAnalysisOrchestratorDependencies['artifactsBuilder']['collectContents'];
    readonly status?: BuildAndPublishResult['status'];
}): Promise<ReleaseAnalysisResult> {
    const analyze = createAnalyzer({
        packageNames: ['pkg-a'],
        buildResults: [publishedBuildResultFor(spec.status)],
        collectContents: spec.collectContents
    });
    const validated = validatedConfigFor(['pkg-a']);

    return analyze(validated, async () => {
        return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
    });
}

async function analyzePartialPublishFailure(
    collectContents: FileCollection
): Promise<ReturnType<typeof expectPartialFailure>> {
    const validated = validatedConfigFor(['pkg-a', 'pkg-b']);
    const analyze = createAnalyzer({
        packageNames: ['pkg-a', 'pkg-b'],
        packageProcessor: packageProcessorWithFailure([publishedBuildResultFor()], new Error('publish failed')),
        collectContents
    });

    return expectPartialFailure(
        await analyze(validated, async () => {
            return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
        })
    );
}

function dependencyOnlyFiles(version: string): readonly {
    readonly content: string;
    readonly filePath: string;
    readonly isExecutable: false;
}[] {
    return [{ filePath: 'package.json', content: `{"name":"pkg-a","version":"${version}"}`, isExecutable: false }];
}

suite('packtory-release-analysis', function () {
    test('runs dry-run publish analysis with staged publishing disabled', async function () {
        const validated = validatedConfigFor(['pkg-a']);
        const analyze = createAnalyzer({
            packageNames: ['pkg-a'],
            packageProcessor: {
                async build() {
                    throw new Error('build() should not be called in release-analysis tests');
                },
                async buildAndPublish() {
                    throw new Error('buildAndPublish() should not be called in release-analysis dry runs');
                },
                async resolveAndLink() {
                    throw new Error('resolveAndLink() should not be called in release-analysis tests');
                },
                async tryBuildAndPublish(options) {
                    assert.strictEqual(options.stage, false);
                    return buildResultFor();
                }
            }
        });

        const result = await analyze(validated, async () => {
            return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
        });

        assert.strictEqual(result.isOk, true);
    });

    test('passes non-partial resolve failures through unchanged', async function () {
        const analyze = createAnalyzer({ packageNames: [] });
        const validated = validatedConfigFor(['pkg-a']);

        const result = await analyze(validated, async () => {
            return Result.err<readonly ResolvedPackage[], ResolveAndLinkFailure>({
                type: 'config',
                issues: ['bad']
            });
        });

        if (result.isOk) {
            assert.fail('Expected an error result');
        }

        assert.strictEqual(result.error.type, 'config');
    });

    test('maps partial resolve failures to release-analysis partial failures with empty succeeded entries', async function () {
        const analyze = createAnalyzer({ packageNames: [] });
        const failure = new Error('resolve failed');
        const validated = validatedConfigFor(['pkg-a']);

        const result = await analyze(validated, async () => {
            const resolvedPackages: readonly ResolvedPackage[] = [];
            return Result.err<readonly ResolvedPackage[], ResolveAndLinkFailure>({
                type: 'partial',
                error: { succeeded: resolvedPackages, failures: [failure] }
            });
        });

        const partial = expectPartialFailure(result);
        assert.deepStrictEqual(partial.succeeded, []);
        assert.deepStrictEqual(partial.failures, [failure]);
    });

    test('skips fresh content collection for already-published build results', async function () {
        const result = await analyzePublishedBuildResult({
            status: 'already-published',
            collectContents() {
                throw new Error('collectContents() should not be called');
            }
        });

        if (result.isErr) {
            assert.fail(`Expected Ok, got ${result.error.type}`);
        }

        assert.strictEqual(result.value.classification, 'unchanged');
        assert.strictEqual(result.value.packageAnalyses[0]?.classification, 'unchanged');
    });

    test('collects package files with the package artifact prefix for newly analyzed releases', async function () {
        const receivedPrefixes: (string | undefined)[] = [];
        const result = await analyzePublishedBuildResult({
            collectContents(_bundle, prefix) {
                receivedPrefixes.push(prefix);
                return dependencyOnlyFiles('1.0.1');
            }
        });

        if (result.isErr) {
            assert.fail(`Expected Ok, got ${result.error.type}`);
        }

        assert.deepStrictEqual(receivedPrefixes, ['package']);
        assert.strictEqual(result.value.classification, 'dependency-only');
    });

    test('treats already-published packages without stored artifacts as unchanged', async function () {
        const analyze = createAnalyzer({
            packageNames: ['pkg-a'],
            buildResults: [
                buildResultFor({
                    status: 'already-published',
                    packageName: 'pkg-a',
                    previousReleaseArtifacts: Maybe.nothing()
                })
            ],
            collectContents() {
                throw new Error('collectContents() should not be called');
            }
        });
        const validated = validatedConfigFor(['pkg-a']);

        const result = await analyze(validated, async () => {
            return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
        });

        if (result.isErr) {
            assert.fail(`Expected Ok, got ${result.error.type}`);
        }

        assert.strictEqual(result.value.packageAnalyses[0]?.classification, 'unchanged');
    });

    test('returns a partial failure when release analysis of a published package throws after publish succeeds', async function () {
        const partial = expectPartialFailure(
            await analyzePublishedBuildResult({
                collectContents() {
                    throw new Error('collect failed');
                }
            })
        );
        assert.strictEqual(partial.succeeded.length, 0);
        assert.strictEqual(partial.failures.length, 1);
        assert.match(partial.failures[0]?.message ?? '', /collect failed/u);
    });

    test('wraps non-Error analysis failures in Error objects', async function () {
        const partial = expectPartialFailure(
            await analyzePublishedBuildResult({
                collectContents() {
                    return vm.runInNewContext("throw 'collect failed'") as readonly {
                        readonly content: string;
                        readonly filePath: string;
                        readonly isExecutable: false;
                    }[];
                }
            })
        );

        assert.match(partial.failures[0]?.message ?? '', /collect failed/u);
    });

    test('keeps analyzed successes when publish later fails after at least one package was analyzed', async function () {
        const partial = await analyzePartialPublishFailure(function collectContents() {
            return dependencyOnlyFiles('1.0.1');
        });

        assert.strictEqual(partial.succeeded.length, 1);
        assert.match(partial.failures[0]?.message ?? '', /publish failed/u);
    });

    test('falls back to analysis-stage succeeded entries when both publish and analysis fail', async function () {
        const partial = await analyzePartialPublishFailure(function collectContents() {
            throw new Error('collect failed');
        });

        assert.strictEqual(partial.succeeded.length, 0);
        assert.match(partial.failures[0]?.message ?? '', /publish failed/u);
    });
});
