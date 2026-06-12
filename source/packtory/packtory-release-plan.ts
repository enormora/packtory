import { Result } from 'true-myth';
import type { ValidConfigResult } from '../config/validation.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import {
    partialFailureType,
    releasePlanPartialFailure,
    type ReleasePlanFailure,
    type ReleasePlanPackage,
    type ReleasePlanResult,
    type ResolveAndLinkFailure
} from './packtory-results.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import { mapResolvePartialFailure, succeededResultsFrom } from './partial-result.ts';
import { createReleasePlanPackage, type ReleasePlanMapperDependencies } from './release-plan.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import { determineVersionAndPublishAll, type PublishStageDependencies } from './stages/publish-stage.ts';

type ResolveAndLinkAllValidated = (
    config: ValidConfigResult
) => Promise<Result<readonly ResolvedPackage[], ResolveAndLinkFailure>>;

export type ReleasePlanOrchestratorDependencies = PublishStageDependencies & ReleasePlanMapperDependencies;

type PublishStageOutcome = Awaited<ReturnType<typeof determineVersionAndPublishAll>>;
type PlanStageError = {
    readonly failures: readonly Error[];
    readonly succeeded: readonly ReleasePlanPackage[];
};

function toReleasePlanError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function analyzedBundlesByNameFrom(resolvedPackages: readonly ResolvedPackage[]): ReadonlyMap<string, AnalyzedBundle> {
    return new Map(
        resolvedPackages.map((resolvedPackage) => {
            return [resolvedPackage.name, resolvedPackage.analyzedBundle] as const;
        })
    );
}

function appendPackagePlan(args: {
    readonly artifactsBuilder: ReleasePlanOrchestratorDependencies['artifactsBuilder'];
    readonly analyzedBundlesByName: ReadonlyMap<string, AnalyzedBundle>;
    readonly buildResult: BuildAndPublishResult;
    readonly packages: ReleasePlanPackage[];
}): void {
    const analyzedBundle = args.analyzedBundlesByName.get(args.buildResult.bundle.name);
    if (analyzedBundle === undefined) {
        throw new Error(`Analyzed bundle for package "${args.buildResult.bundle.name}" is missing`);
    }
    args.packages.push(createReleasePlanPackage(args, analyzedBundle, args.buildResult));
}

async function planSucceededPublishes(
    artifactsBuilder: ReleasePlanOrchestratorDependencies['artifactsBuilder'],
    resolvedPackages: readonly ResolvedPackage[],
    succeededPublish: readonly BuildAndPublishResult[]
): Promise<Result<readonly ReleasePlanPackage[], PlanStageError>> {
    const analyzedBundlesByName = analyzedBundlesByNameFrom(resolvedPackages);
    const packages: ReleasePlanPackage[] = [];
    const failures: Error[] = [];

    for (const buildResult of succeededPublish) {
        try {
            appendPackagePlan({ artifactsBuilder, analyzedBundlesByName, buildResult, packages });
        } catch (error: unknown) {
            failures.push(toReleasePlanError(error));
        }
    }

    return failures.length === 0 ? Result.ok(packages) : Result.err({ failures, succeeded: packages });
}

function mapResolveFailureToReleasePlanFailure(error: ResolveAndLinkFailure): ReleasePlanFailure {
    if (error.type === partialFailureType) {
        return mapResolvePartialFailure<ReleasePlanPackage>(error);
    }
    return error;
}

function buildPartialFromPublish(
    publishResult: Extract<PublishStageOutcome, { isErr: true }>,
    packages: readonly ReleasePlanPackage[]
): ReleasePlanFailure {
    return {
        type: partialFailureType,
        succeeded: packages,
        failures: publishResult.error.failures
    };
}

function toFinalReleasePlanResult(
    publishResult: PublishStageOutcome,
    planResult: Awaited<ReturnType<typeof planSucceededPublishes>>
): ReleasePlanResult {
    if (publishResult.isErr) {
        return Result.err(
            buildPartialFromPublish(publishResult, planResult.isOk ? planResult.value : planResult.error.succeeded)
        );
    }

    if (planResult.isErr) {
        return Result.err(releasePlanPartialFailure(planResult.error));
    }

    return Result.ok({ packages: planResult.value });
}

export function createPlanReleaseAgainstLatestPublishedValidated(
    dependencies: ReleasePlanOrchestratorDependencies
): (
    validated: ValidConfigResult,
    resolveAndLinkAllValidated: ResolveAndLinkAllValidated
) => Promise<ReleasePlanResult> {
    return async function planReleaseAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated) {
        const resolved = await resolveAndLinkAllValidated(validated);
        if (resolved.isErr) {
            return Result.err(mapResolveFailureToReleasePlanFailure(resolved.error));
        }

        const publishResult = await determineVersionAndPublishAll(dependencies, validated, resolved.value, {
            dryRun: true,
            stage: false
        });
        const planResult = await planSucceededPublishes(
            dependencies.artifactsBuilder,
            resolved.value,
            succeededResultsFrom(publishResult)
        );
        return toFinalReleasePlanResult(publishResult, planResult);
    };
}
