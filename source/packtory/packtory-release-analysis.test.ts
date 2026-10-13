import assert from 'node:assert';
import virtualMachine from 'node:vm';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import {
    buildResultFor,
    createReleaseTestDependencies,
    packageProcessorCheckingStage,
    packageProcessorWithFailure,
    previousReleaseArtifactsFor,
    resolvedPackagesFor,
    validatedReleaseConfigurationFor,
    type ReleaseFileCollection
} from '../test-libraries/release-orchestrator-fixtures.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import {
    createAnalyzeReleaseAgainstLatestPublishedValidated,
    type ReleaseAnalysisOrchestratorDependencies
} from './packtory-release-analysis.ts';
import type {
    partialFailureType,
    ReleaseAnalysisFailure,
    ReleaseAnalysisResult,
    ResolveAndLinkFailure
} from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

type PackageProcessor = ReleaseAnalysisOrchestratorDependencies['packageProcessor'];
type FileCollection = ReleaseFileCollection;
type ReleaseAnalyzer = ReturnType<typeof createAnalyzeReleaseAgainstLatestPublishedValidated>;
type AnalyzerSpecification = {
    readonly packageNames: readonly string[];
    readonly buildResults?: readonly BuildAndPublishResult[];
    readonly collectContents?: ReleaseAnalysisOrchestratorDependencies['artifactsBuilder']['collectContents'];
    readonly packageProcessor?: PackageProcessor;
};
type AnalyzePublishedBuildResultSpecification = {
    readonly collectContents: ReleaseAnalysisOrchestratorDependencies['artifactsBuilder']['collectContents'];
    readonly status?: BuildAndPublishResult['status'];
};
type DependencyOnlyFile = {
    readonly content: string;
    readonly filePath: string;
    readonly isExecutable: false;
};
type PartialFailureMarker = {
    readonly type: typeof partialFailureType;
};
type ReleaseAnalysisPartialFailure = Extract<ReleaseAnalysisFailure, PartialFailureMarker>;

function createAnalyzer(input: AnalyzerSpecification): ReleaseAnalyzer {
    return createAnalyzeReleaseAgainstLatestPublishedValidated(createReleaseTestDependencies(input));
}

function expectPartialFailure(result: ReleaseAnalysisResult): ReleaseAnalysisPartialFailure {
    if (result.isOk || result.error.type !== 'partial') {
        assert.fail('Expected a partial release-analysis failure');
    }

    return result.error;
}

function publishedBuildResultFor(status: BuildAndPublishResult['status'] = 'new-version'): BuildAndPublishResult {
    return buildResultFor({
        status,
        packageName: 'package-a',
        previousReleaseArtifacts: previousReleaseArtifactsFor({
            version: '1.0.0',
            publishedAt: new Date('2026-05-01T00:00:00.000Z'),
            files: [ {
                filePath: 'package.json',
                content: '{"name":"package-a","version":"1.0.0"}',
                isExecutable: false
            } ]
        })
    });
}

async function analyzePublishedBuildResult(
    input: AnalyzePublishedBuildResultSpecification
): Promise<ReleaseAnalysisResult> {
    const analyze = createAnalyzer({
        packageNames: [ 'package-a' ],
        buildResults: [ publishedBuildResultFor(input.status) ],
        collectContents: input.collectContents
    });
    const validated = validatedReleaseConfigurationFor([ 'package-a' ]);

    return analyze(validated, async function () {
        return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
    });
}

async function analyzePartialPublishFailure(
    collectContents: FileCollection
): Promise<ReleaseAnalysisPartialFailure> {
    const validated = validatedReleaseConfigurationFor([ 'package-a', 'package-b' ]);
    const analyze = createAnalyzer({
        packageNames: [ 'package-a', 'package-b' ],
        packageProcessor: packageProcessorWithFailure([ publishedBuildResultFor() ], new Error('publish failed')),
        collectContents
    });

    return expectPartialFailure(
        await analyze(validated, async function () {
            return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
        })
    );
}

function dependencyOnlyFiles(version: string): readonly DependencyOnlyFile[] {
    return [ {
        filePath: 'package.json',
        content: `{"name":"package-a","version":"${version}"}`,
        isExecutable: false
    } ];
}

suite('packtory-release-analysis', function () {
    test('runs dry-run publish analysis with staged publishing disabled', async function () {
        const validated = validatedReleaseConfigurationFor([ 'package-a' ]);
        const analyze = createAnalyzer({
            packageNames: [ 'package-a' ],
            packageProcessor: packageProcessorCheckingStage(false)
        });

        const result = await analyze(validated, async function () {
            return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(resolvedPackagesFor(validated));
        });

        assert.strictEqual(result.isOk, true);
    });

    test('passes non-partial resolve failures through unchanged', async function () {
        const analyze = createAnalyzer({ packageNames: [] });
        const validated = validatedReleaseConfigurationFor([ 'package-a' ]);

        const result = await analyze(validated, async function () {
            return Result.err<readonly ResolvedPackage[], ResolveAndLinkFailure>({
                type: 'configuration',
                issues: [ 'bad' ]
            });
        });

        if (result.isOk) {
            assert.fail('Expected an error result');
        }

        assert.strictEqual(result.error.type, 'configuration');
    });

    test('maps partial resolve failures to release-analysis partial failures with empty succeeded entries', async function () {
        const analyze = createAnalyzer({ packageNames: [] });
        const failure = new Error('resolve failed');
        const validated = validatedReleaseConfigurationFor([ 'package-a' ]);

        const result = await analyze(validated, async function () {
            const resolvedPackages: readonly ResolvedPackage[] = [];
            return Result.err<readonly ResolvedPackage[], ResolveAndLinkFailure>({
                type: 'partial',
                error: { succeeded: resolvedPackages, failures: [ failure ] }
            });
        });

        const partial = expectPartialFailure(result);
        assertDeepSubset(partial, {
            succeeded: [],
            failures: [ failure ]
        });
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

        assert.deepStrictEqual(receivedPrefixes, [ 'package' ]);
        assert.strictEqual(result.value.classification, 'dependency-only');
    });

    test('treats already-published packages without stored artifacts as unchanged', async function () {
        const analyze = createAnalyzer({
            packageNames: [ 'package-a' ],
            buildResults: [
                buildResultFor({
                    status: 'already-published',
                    packageName: 'package-a'
                })
            ],
            collectContents() {
                throw new Error('collectContents() should not be called');
            }
        });
        const validated = validatedReleaseConfigurationFor([ 'package-a' ]);

        const result = await analyze(validated, async function () {
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
        assertDeepSubset(partial, {
            succeeded: {
                length: 0
            },
            failures: {
                length: 1
            }
        });
        assert.match(partial.failures[0]?.message ?? '', /collect failed/u);
    });

    test('wraps non-Error analysis failures in Error objects', async function () {
        const partial = expectPartialFailure(
            await analyzePublishedBuildResult({
                collectContents() {
                    return virtualMachine.runInNewContext("throw 'collect failed'") as readonly {
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
