import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Maybe, Result } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { ValidConfigResult } from '../config/validation.ts';
import type { BuildReport } from '../report/aggregator/report-types.ts';
import {
    emptyScheduler,
    stubPackageProcessor,
    stubProgressBroadcaster
} from '../test-libraries/orchestrator-stub-fixtures.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import {
    createDiffAgainstLatestPublishedValidated,
    ensureReportPackages,
    mapResolveFailureToReleaseDiffFailure,
    succeededFromPublish,
    succeededFromStage,
    synthesizeFallbackPackageReport,
    toFinalReleaseDiffResult
} from './packtory-release-diff.ts';
import type { ResolvedPackage } from './resolved-package.ts';

const artifactsBuilder = { collectContents: () => [] } as unknown as Pick<ArtifactsBuilder, 'collectContents'>;

function configFor(packageNames: readonly string[]): ValidConfigResult {
    return {
        packtoryConfig: {
            packages: packageNames.map((name) => {
                return { name };
            })
        }
    } as unknown as ValidConfigResult;
}

function emptyReport(): BuildReport {
    return {
        schemaVersion: 1,
        generatedAt: '2026-05-19T00:00:00.000Z',
        packages: {},
        aggregate: { crossBundleLinks: [] }
    };
}

suite('packtory-release-diff', function () {
    test('propagates a resolve-stage config failure as a release-diff config failure', async function () {
        const diffAgainstLatestPublishedValidated = createDiffAgainstLatestPublishedValidated({
            artifactsBuilder,
            packageProcessor: stubPackageProcessor,
            progressBroadcaster: stubProgressBroadcaster,
            scheduler: emptyScheduler
        });
        const result = await diffAgainstLatestPublishedValidated(
            configFor([]),
            async () => Result.err({ type: 'config', issues: ['bad config'] }),
            emptyReport
        );

        if (result.isOk) {
            assert.fail('expected an Err result');
        }
        assert.strictEqual(result.error.type, 'config');
    });

    test('returns an Ok release-diff result when resolve and publish-stage both succeed', async function () {
        const diffAgainstLatestPublishedValidated = createDiffAgainstLatestPublishedValidated({
            artifactsBuilder,
            packageProcessor: stubPackageProcessor,
            progressBroadcaster: stubProgressBroadcaster,
            scheduler: emptyScheduler
        });
        const result = await diffAgainstLatestPublishedValidated(
            configFor([]),
            async () => Result.ok([] as readonly ResolvedPackage[]),
            emptyReport
        );

        if (result.isErr) {
            assert.fail('expected an Ok result');
        }
        assert.deepStrictEqual(result.value, []);
    });

    test('mapResolveFailureToReleaseDiffFailure passes through config and checks failures unchanged', function () {
        const configFailure = { type: 'config' as const, issues: ['bad config'] };
        const checksFailure = { type: 'checks' as const, issues: ['bad check'] };
        assert.deepStrictEqual(mapResolveFailureToReleaseDiffFailure(configFailure), configFailure);
        assert.deepStrictEqual(mapResolveFailureToReleaseDiffFailure(checksFailure), checksFailure);
    });

    test('mapResolveFailureToReleaseDiffFailure converts a resolve partial failure to an empty-succeeded release-diff partial failure', function () {
        const resolveFailures = [new Error('a'), new Error('b')];
        const releaseDiffFailure = mapResolveFailureToReleaseDiffFailure({
            type: 'partial',
            error: { succeeded: [], failures: resolveFailures }
        });
        if (releaseDiffFailure.type !== 'partial') {
            assert.fail(`expected partial failure, got ${releaseDiffFailure.type}`);
        }
        assert.deepStrictEqual(releaseDiffFailure.succeeded, []);
        assert.deepStrictEqual(releaseDiffFailure.failures, resolveFailures);
    });

    test('synthesizeFallbackPackageReport derives the version decision from previousReleaseArtifacts when present', function () {
        const result = {
            status: 'new-version',
            bundle: { name: 'pkg-a', version: '1.0.1' },
            extraFiles: [],
            previousReleaseArtifacts: Maybe.just({ version: '1.0.0', files: [] })
        } as unknown as BuildAndPublishResult;
        const report = synthesizeFallbackPackageReport(result);
        assert.deepStrictEqual(report.decisions.version, {
            previousVersion: '1.0.0',
            chosenVersion: '1.0.1',
            trigger: 'auto-patch-bump'
        });
    });

    test('synthesizeFallbackPackageReport marks the trigger as initial when there is no previousReleaseArtifacts', function () {
        const result = {
            status: 'initial-version',
            bundle: { name: 'pkg-a', version: '1.0.0' },
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        } as unknown as BuildAndPublishResult;
        const report = synthesizeFallbackPackageReport(result);
        assert.deepStrictEqual(report.decisions.version, {
            previousVersion: undefined,
            chosenVersion: '1.0.0',
            trigger: 'initial'
        });
    });

    test('ensureReportPackages returns the original report when every succeeded package is already represented', function () {
        const baseReport = emptyReport();
        const succeeded: readonly BuildAndPublishResult[] = [];
        assert.strictEqual(ensureReportPackages(baseReport, succeeded), baseReport);
    });

    test('ensureReportPackages adds a fallback package entry for a succeeded package missing from the report', function () {
        const baseReport = emptyReport();
        const result = {
            status: 'new-version',
            bundle: { name: 'pkg-missing', version: '2.0.0' },
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        } as unknown as BuildAndPublishResult;
        const merged = ensureReportPackages(baseReport, [result]);
        const synthesizedReport = merged.packages['pkg-missing'];
        assert.ok(synthesizedReport);
        assert.strictEqual(synthesizedReport.decisions.version?.chosenVersion, '2.0.0');
    });

    test('toFinalReleaseDiffResult returns a partial Err with publish-stage failures when publish-stage failed', function () {
        const publishFailure = new Error('publish failed');
        const finalResult = toFinalReleaseDiffResult(
            Result.err({ succeeded: [], failures: [publishFailure] }),
            Result.ok([])
        );
        if (finalResult.isOk) {
            assert.fail('expected Err');
        }
        if (finalResult.error.type !== 'partial') {
            assert.fail(`expected partial failure, got ${finalResult.error.type}`);
        }
        assert.deepStrictEqual(finalResult.error.failures, [publishFailure]);
    });

    test('toFinalReleaseDiffResult returns a partial Err with release-diff stage failures when only the stage failed', function () {
        const stageFailure = new Error('stage failed');
        const finalResult = toFinalReleaseDiffResult(
            Result.ok([]),
            Result.err({ succeeded: [], failures: [stageFailure] })
        );
        if (finalResult.isOk) {
            assert.fail('expected Err');
        }
        if (finalResult.error.type !== 'partial') {
            assert.fail(`expected partial failure, got ${finalResult.error.type}`);
        }
        assert.deepStrictEqual(finalResult.error.failures, [stageFailure]);
    });

    test('succeededFromStage returns the partial succeeded array when the stage failed', function () {
        const partialSucceeded = [
            {
                name: 'pkg-a',
                state: 'changed' as const,
                versionTransition: '1 -> 2',
                previousVersionLabel: '1',
                files: { added: [], removed: [], modified: [], unchanged: [] },
                diagnostics: { decisions: {}, timings: {} }
            }
        ];
        const stageResult = Result.err({
            succeeded: partialSucceeded,
            failures: [new Error('boom')]
        });
        assert.strictEqual(succeededFromStage(stageResult), partialSucceeded);
    });

    test('succeededFromPublish returns the partial succeeded array when publish failed', function () {
        const partialSucceeded = [
            {
                status: 'new-version',
                bundle: { name: 'pkg-a', version: '1.0.0' },
                extraFiles: [],
                previousReleaseArtifacts: Maybe.nothing()
            } as unknown as BuildAndPublishResult
        ];
        const publishResult = Result.err({
            succeeded: partialSucceeded,
            failures: [new Error('publish boom')]
        });
        assert.strictEqual(succeededFromPublish(publishResult), partialSucceeded);
    });
});
