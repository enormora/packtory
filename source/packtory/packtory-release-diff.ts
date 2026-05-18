import { Result } from 'true-myth';
import type { ValidConfigResult } from '../config/validation.ts';
import type { BuildReport, PackageReport } from '../report/aggregator/report-types.ts';
import type { PackageReleaseDiff } from '../report/release-diff/release-diff-document.ts';
import {
    releaseDiffPartialFailure,
    type ReleaseDiffAllResult,
    type ReleaseDiffFailure,
    type ResolveAndLinkFailure
} from './packtory-results.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import { determineVersionAndPublishAll, type PublishStageDependencies } from './stages/publish-stage.ts';
import { runReleaseDiffStage, type ReleaseDiffStageDependencies } from './stages/release-diff-stage.ts';

const emptyAggregateReport: BuildReport = {
    schemaVersion: 1,
    generatedAt: '1970-01-01T00:00:00.000Z',
    packages: {},
    aggregate: { crossBundleLinks: [] }
};

type ResolveAndLinkAllValidated = (
    config: ValidConfigResult
) => Promise<Result<readonly ResolvedPackage[], ResolveAndLinkFailure>>;

export type ReleaseDiffOrchestratorDependencies = PublishStageDependencies & ReleaseDiffStageDependencies;

type PublishStageOutcome = Awaited<ReturnType<typeof determineVersionAndPublishAll>>;
type ReleaseDiffStageOutcome = Awaited<ReturnType<typeof runReleaseDiffStage>>;

function mapResolveFailureToReleaseDiffFailure(error: ResolveAndLinkFailure): ReleaseDiffFailure {
    if (error.type === 'partial') {
        return { type: 'partial', succeeded: [], failures: error.error.failures };
    }
    return error;
}

function succeededFromStage(stageResult: ReleaseDiffStageOutcome): readonly PackageReleaseDiff[] {
    if (stageResult.isOk) {
        return stageResult.value;
    }
    return stageResult.error.succeeded;
}

function ensureReport(report: BuildReport | undefined): BuildReport {
    return report ?? emptyAggregateReport;
}

function succeededFromPublish(publishResult: PublishStageOutcome): readonly BuildAndPublishResult[] {
    if (publishResult.isOk) {
        return publishResult.value;
    }
    return publishResult.error.succeeded;
}

function buildPartialFromPublish(
    publishResult: Extract<PublishStageOutcome, { isErr: true }>,
    stageResult: ReleaseDiffStageOutcome
): ReleaseDiffFailure {
    return {
        type: 'partial',
        succeeded: succeededFromStage(stageResult),
        failures: publishResult.error.failures
    };
}

function synthesizeFallbackPackageReport(result: BuildAndPublishResult): PackageReport {
    const previousVersion = result.previousReleaseArtifacts.isJust
        ? result.previousReleaseArtifacts.value.version
        : undefined;
    return {
        decisions: {
            version: {
                previousVersion,
                chosenVersion: result.bundle.version,
                trigger: previousVersion === undefined ? 'initial' : 'auto-patch-bump'
            }
        },
        timings: {}
    };
}

function ensureReportPackages(report: BuildReport, succeeded: readonly BuildAndPublishResult[]): BuildReport {
    const missingPackageReports: Record<string, PackageReport> = {};
    for (const result of succeeded) {
        if (!Object.hasOwn(report.packages, result.bundle.name)) {
            missingPackageReports[result.bundle.name] = synthesizeFallbackPackageReport(result);
        }
    }
    if (Object.keys(missingPackageReports).length === 0) {
        return report;
    }
    return { ...report, packages: { ...report.packages, ...missingPackageReports } };
}

function toFinalResult(publishResult: PublishStageOutcome, stageResult: ReleaseDiffStageOutcome): ReleaseDiffAllResult {
    if (publishResult.isErr) {
        return Result.err(buildPartialFromPublish(publishResult, stageResult));
    }
    if (stageResult.isErr) {
        return Result.err(releaseDiffPartialFailure(stageResult.error));
    }
    return Result.ok(stageResult.value);
}

export function createDiffAgainstLatestPublishedValidated(
    dependencies: ReleaseDiffOrchestratorDependencies
): (
    validated: ValidConfigResult,
    resolveAndLinkAllValidated: ResolveAndLinkAllValidated,
    getReport: () => BuildReport | undefined
) => Promise<ReleaseDiffAllResult> {
    return async function diffAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated, getReport) {
        const resolved = await resolveAndLinkAllValidated(validated);
        if (resolved.isErr) {
            return Result.err(mapResolveFailureToReleaseDiffFailure(resolved.error));
        }
        const publishResult = await determineVersionAndPublishAll(dependencies, validated, resolved.value, {
            dryRun: true
        });
        const succeededPublish = succeededFromPublish(publishResult);
        const report = ensureReportPackages(ensureReport(getReport()), succeededPublish);
        const stageResult = await runReleaseDiffStage(dependencies, validated, succeededPublish, report);
        return toFinalResult(publishResult, stageResult);
    };
}
