import { Result } from 'true-myth';
import type { ValidConfigResult } from '../config/validation.ts';
import type { CurrentGitHeadReader } from '../git/current-git-head.ts';
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
import {
    createReleasePlanPackage,
    type CollectReleaseArtifactFiles,
    type ReleasePlanMapperDependencies
} from './release-plan.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import { classifyPackageRelease } from './release-analysis.ts';
import { determineVersionAndPublishAll, type PublishStageDependencies } from './stages/publish-stage.ts';

type ResolveAndLinkAllValidated = (
    config: ValidConfigResult
) => Promise<Result<readonly ResolvedPackage[], ResolveAndLinkFailure>>;

type ReleasePlanArtifactDependencies = {
    readonly artifactsBuilder: { readonly collectContents: CollectReleaseArtifactFiles; };
};
type ReleasePlanPublishingDependencies = PublishStageDependencies & ReleasePlanArtifactDependencies;
type ReleasePlanOrchestratorDependencies = ReleasePlanMapperDependencies & ReleasePlanPublishingDependencies;
type ReleasePlanDependencies = ReleasePlanOrchestratorDependencies & {
    readonly readCurrentGitHead: CurrentGitHeadReader;
};

type PublishStageOutcome = Awaited<ReturnType<typeof determineVersionAndPublishAll>>;
type PlanStageError = {
    readonly failures: readonly Error[];
    readonly succeeded: readonly ReleasePlanPackage[];
};

function toReleasePlanError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function resolvedPackagesByNameFrom(
    resolvedPackages: readonly ResolvedPackage[]
): ReadonlyMap<string, ResolvedPackage> {
    return new Map(
        resolvedPackages.map(function (resolvedPackage) {
            return [ resolvedPackage.name, resolvedPackage ] as const;
        })
    );
}

type CreatePackagePlanInput = {
    readonly artifactsBuilder: ReleasePlanOrchestratorDependencies['artifactsBuilder'];
    readonly buildResult: BuildAndPublishResult;
    readonly currentGitHead: string | undefined;
    readonly fileManager: ReleasePlanOrchestratorDependencies['fileManager'];
    readonly repositoryFolder: string;
    readonly resolvedPackagesByName: ReadonlyMap<string, ResolvedPackage>;
};

async function createPackagePlan(args: CreatePackagePlanInput): Promise<ReleasePlanPackage> {
    const packageName = args.buildResult.bundle.name;
    const resolvedPackage = args.resolvedPackagesByName.get(packageName);
    if (resolvedPackage === undefined) {
        throw new Error(`Resolved package "${packageName}" is missing`);
    }
    const releaseArtifactFiles = args.artifactsBuilder.collectContents(
        args.buildResult.bundle,
        'package',
        args.buildResult.extraFiles
    );
    return createReleasePlanPackage(args, resolvedPackage.analyzedBundle, args.buildResult, {
        changelogSourceOptions: resolvedPackage.resolveOptions,
        currentGitHead: args.currentGitHead,
        releaseArtifactFiles,
        releaseClassification: classifyPackageRelease(args.buildResult, releaseArtifactFiles).classification
    });
}

async function planSucceededPublishes(
    dependencies: ReleasePlanOrchestratorDependencies,
    resolvedPackages: readonly ResolvedPackage[],
    succeededPublish: readonly BuildAndPublishResult[],
    currentGitHead: string | undefined
): Promise<Result<readonly ReleasePlanPackage[], PlanStageError>> {
    const resolvedPackagesByName = resolvedPackagesByNameFrom(resolvedPackages);
    const packages: ReleasePlanPackage[] = [];
    const failures: Error[] = [];

    for (const buildResult of succeededPublish) {
        try {
            const packagePlan = await createPackagePlan({
                artifactsBuilder: dependencies.artifactsBuilder,
                buildResult,
                currentGitHead,
                fileManager: dependencies.fileManager,
                repositoryFolder: dependencies.repositoryFolder,
                resolvedPackagesByName
            });
            packages.push(packagePlan);
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
    publishResult: Extract<PublishStageOutcome, { readonly isErr: true; }>,
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
    dependencies: ReleasePlanDependencies
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
        const currentGitHead = await dependencies.readCurrentGitHead();
        const planResult = await planSucceededPublishes(
            dependencies,
            resolved.value,
            succeededResultsFrom(publishResult),
            currentGitHead
        );
        return toFinalReleasePlanResult(publishResult, planResult);
    };
}
