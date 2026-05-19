import { Result } from 'true-myth';
import type { ValidConfigResult } from '../config/validation.ts';
import type { PackageReleaseDiff } from '../report/release-diff/file-set-diff.ts';
import {
    releaseDiffPartialFailure,
    type ReleaseDiffAllResult,
    type ReleaseDiffFailure,
    type ResolveAndLinkFailure
} from './packtory-results.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import { mapResolveFailureToReleaseDiffFailure } from './release-diff-failure-mapping.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import { determineVersionAndPublishAll, type PublishStageDependencies } from './stages/publish-stage.ts';
import { runReleaseDiffStage, type ReleaseDiffStageDependencies } from './stages/release-diff-stage.ts';

type ResolveAndLinkAllValidated = (
    config: ValidConfigResult
) => Promise<Result<readonly ResolvedPackage[], ResolveAndLinkFailure>>;

export type ReleaseDiffOrchestratorDependencies = PublishStageDependencies & ReleaseDiffStageDependencies;

type PublishStageOutcome = Awaited<ReturnType<typeof determineVersionAndPublishAll>>;
type ReleaseDiffStageOutcome = Awaited<ReturnType<typeof runReleaseDiffStage>>;

function succeededFromStage(stageResult: ReleaseDiffStageOutcome): readonly PackageReleaseDiff[] {
    if (stageResult.isOk) {
        return stageResult.value;
    }
    return stageResult.error.succeeded;
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

function toFinalReleaseDiffResult(
    publishResult: PublishStageOutcome,
    stageResult: ReleaseDiffStageOutcome
): ReleaseDiffAllResult {
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
    resolveAndLinkAllValidated: ResolveAndLinkAllValidated
) => Promise<ReleaseDiffAllResult> {
    return async function diffAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated) {
        const resolved = await resolveAndLinkAllValidated(validated);
        if (resolved.isErr) {
            return Result.err(mapResolveFailureToReleaseDiffFailure(resolved.error));
        }
        const publishResult = await determineVersionAndPublishAll(dependencies, validated, resolved.value, {
            dryRun: true
        });
        const succeededPublish = succeededFromPublish(publishResult);
        const stageResult = await runReleaseDiffStage(dependencies, validated, succeededPublish);
        return toFinalReleaseDiffResult(publishResult, stageResult);
    };
}
