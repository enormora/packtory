import { Result } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { ValidConfigResult } from '../config/validation.ts';
import {
    partialFailureType,
    releaseAnalysisPartialFailure,
    type PackageReleaseAnalysis,
    type ReleaseAnalysisFailure,
    type ReleaseAnalysisResult,
    type ResolveAndLinkFailure
} from './packtory-results.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import { mapResolvePartialFailure, succeededResultsFrom } from './partial-result.ts';
import { wasAlreadyPublished } from './published-release-state.ts';
import { classifyPackageRelease, summarizeReleaseAnalysis } from './release-analysis.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import { determineVersionAndPublishAll, type PublishStageDependencies } from './stages/publish-stage.ts';

type ResolveAndLinkAllValidated = (
    config: ValidConfigResult
) => Promise<Result<readonly ResolvedPackage[], ResolveAndLinkFailure>>;

export type ReleaseAnalysisOrchestratorDependencies = PublishStageDependencies & {
    readonly artifactsBuilder: Pick<ArtifactsBuilder, 'collectContents'>;
};

type PublishStageOutcome = Awaited<ReturnType<typeof determineVersionAndPublishAll>>;
type AnalysisStageError = {
    readonly failures: readonly Error[];
    readonly succeeded: readonly PackageReleaseAnalysis[];
};
function toReleaseAnalysisError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function analyzeBuildResult(
    artifactsBuilder: ReleaseAnalysisOrchestratorDependencies['artifactsBuilder'],
    buildResult: BuildAndPublishResult
): PackageReleaseAnalysis {
    const newFiles = wasAlreadyPublished(buildResult)
        ? buildResult.extraFiles
        : artifactsBuilder.collectContents(buildResult.bundle, 'package', buildResult.extraFiles);
    return classifyPackageRelease(buildResult, newFiles);
}

async function analyzeSucceededPublishes(
    artifactsBuilder: ReleaseAnalysisOrchestratorDependencies['artifactsBuilder'],
    succeededPublish: readonly BuildAndPublishResult[]
): Promise<Result<readonly PackageReleaseAnalysis[], AnalysisStageError>> {
    const analyses: PackageReleaseAnalysis[] = [];
    const failures: Error[] = [];

    for (const buildResult of succeededPublish) {
        try {
            analyses.push(analyzeBuildResult(artifactsBuilder, buildResult));
        } catch (error: unknown) {
            failures.push(toReleaseAnalysisError(error));
        }
    }

    return failures.length === 0 ? Result.ok(analyses) : Result.err({ failures, succeeded: analyses });
}

function mapResolveFailureToReleaseAnalysisFailure(error: ResolveAndLinkFailure): ReleaseAnalysisFailure {
    if (error.type === partialFailureType) {
        return mapResolvePartialFailure<PackageReleaseAnalysis>(error);
    }
    return error;
}

function buildPartialFromPublish(
    publishResult: Extract<PublishStageOutcome, { readonly isErr: true; }>,
    analyses: readonly PackageReleaseAnalysis[]
): ReleaseAnalysisFailure {
    return {
        type: partialFailureType,
        succeeded: analyses,
        failures: publishResult.error.failures
    };
}

function toFinalReleaseAnalysisResult(
    publishResult: PublishStageOutcome,
    analysisResult: Awaited<ReturnType<typeof analyzeSucceededPublishes>>
): ReleaseAnalysisResult {
    if (publishResult.isErr) {
        return Result.err(
            buildPartialFromPublish(
                publishResult,
                analysisResult.isOk ? analysisResult.value : analysisResult.error.succeeded
            )
        );
    }

    if (analysisResult.isErr) {
        return Result.err(releaseAnalysisPartialFailure(analysisResult.error));
    }

    return Result.ok(summarizeReleaseAnalysis(analysisResult.value));
}

export function createAnalyzeReleaseAgainstLatestPublishedValidated(
    dependencies: ReleaseAnalysisOrchestratorDependencies
): (
    validated: ValidConfigResult,
    resolveAndLinkAllValidated: ResolveAndLinkAllValidated
) => Promise<ReleaseAnalysisResult> {
    return async function analyzeReleaseAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated) {
        const resolved = await resolveAndLinkAllValidated(validated);
        if (resolved.isErr) {
            return Result.err(mapResolveFailureToReleaseAnalysisFailure(resolved.error));
        }

        const publishResult = await determineVersionAndPublishAll(dependencies, validated, resolved.value, {
            dryRun: true,
            stage: false
        });
        const analysisResult = await analyzeSucceededPublishes(
            dependencies.artifactsBuilder,
            succeededResultsFrom(publishResult)
        );
        return toFinalReleaseAnalysisResult(publishResult, analysisResult);
    };
}
