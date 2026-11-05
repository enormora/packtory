import { Result } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { ValidConfigurationResult } from '../configuration/validation.ts';
import type {
    PackageReleaseAnalysis,
    ReleaseAnalysisResult
} from './packtory-results.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import { prepareRelease, type ResolveReleasePackages } from './prepared-release.ts';
import { wasAlreadyPublished } from './published-release-state.ts';
import { classifyPackageRelease, summarizeReleaseAnalysis } from './release-analysis.ts';
import type { PublishStageDependencies } from './stages/publish-stage.ts';

export type ReleaseAnalysisOrchestratorDependencies = PublishStageDependencies & {
    readonly artifactsBuilder: Pick<ArtifactsBuilder, 'collectContents'>;
};

function analyzeBuildResult(
    artifactsBuilder: ReleaseAnalysisOrchestratorDependencies['artifactsBuilder'],
    buildResult: BuildAndPublishResult
): PackageReleaseAnalysis {
    const newFiles = wasAlreadyPublished(buildResult)
        ? buildResult.extraFiles
        : artifactsBuilder.collectContents(buildResult.bundle, 'package', buildResult.extraFiles);
    return classifyPackageRelease(buildResult, newFiles);
}

export function createAnalyzeReleaseAgainstLatestPublishedValidated(
    dependencies: ReleaseAnalysisOrchestratorDependencies
): (
    validated: ValidConfigurationResult,
    resolveAndLinkAllValidated: ResolveReleasePackages
) => Promise<ReleaseAnalysisResult> {
    return async function analyzeReleaseAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated) {
        const prepared = await prepareRelease(dependencies, validated, resolveAndLinkAllValidated);
        if (prepared.isErr) {
            return Result.err(prepared.error);
        }
        const analysis = await prepared.value.project(function (buildResult) {
            return analyzeBuildResult(dependencies.artifactsBuilder, buildResult);
        });
        return analysis.map(summarizeReleaseAnalysis);
    };
}
