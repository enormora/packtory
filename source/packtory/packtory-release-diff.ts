import { Result } from 'true-myth';
import type { ValidConfigurationResult } from '../configuration/validation.ts';
import { prepareRelease, type ResolveReleasePackages } from './prepared-release.ts';
import type { ReleaseDiffAllResult } from './packtory-results.ts';
import type { PublishStageDependencies } from './stages/publish-stage.ts';
import { runReleaseDiffStage, type ReleaseDiffStageDependencies } from './stages/release-diff-stage.ts';

export type ReleaseDiffOrchestratorDependencies = PublishStageDependencies & ReleaseDiffStageDependencies;

export function createDiffAgainstLatestPublishedValidated(
    dependencies: ReleaseDiffOrchestratorDependencies
): (
    validated: ValidConfigurationResult,
    resolveAndLinkAllValidated: ResolveReleasePackages
) => Promise<ReleaseDiffAllResult> {
    return async function diffAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated) {
        const prepared = await prepareRelease(dependencies, validated, resolveAndLinkAllValidated);
        if (prepared.isErr) {
            return Result.err(prepared.error);
        }
        const result = await runReleaseDiffStage(dependencies, validated, prepared.value.packages);
        return prepared.value.finish(result);
    };
}
