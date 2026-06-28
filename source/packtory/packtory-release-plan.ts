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
    collectReleasePlanChangelogSourceFiles,
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
    readonly artifactsBuilder: { readonly collectContents: CollectReleaseArtifactFiles };
};
type ReleasePlanOrchestratorDependencies = PublishStageDependencies &
    ReleasePlanArtifactDependencies &
    ReleasePlanMapperDependencies;
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
        resolvedPackages.map((resolvedPackage) => {
            return [resolvedPackage.name, resolvedPackage] as const;
        })
    );
}

async function appendPackagePlan(args: {
    readonly artifactsBuilder: ReleasePlanOrchestratorDependencies['artifactsBuilder'];
    readonly buildResult: BuildAndPublishResult;
    readonly currentGitHead: string | undefined;
    readonly fileManager: ReleasePlanOrchestratorDependencies['fileManager'];
    readonly packages: ReleasePlanPackage[];
    readonly repositoryFolder: string;
    readonly resolvedPackagesByName: ReadonlyMap<string, ResolvedPackage>;
}): Promise<void> {
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
    args.packages.push(
        await createReleasePlanPackage(args, resolvedPackage.analyzedBundle, args.buildResult, {
            changelogSourceFiles: collectReleasePlanChangelogSourceFiles(resolvedPackage.resolveOptions),
            currentGitHead: args.currentGitHead,
            releaseArtifactFiles,
            releaseClassification: classifyPackageRelease(args.buildResult, releaseArtifactFiles).classification
        })
    );
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
            await appendPackagePlan({
                artifactsBuilder: dependencies.artifactsBuilder,
                buildResult,
                currentGitHead,
                fileManager: dependencies.fileManager,
                packages,
                repositoryFolder: dependencies.repositoryFolder,
                resolvedPackagesByName
            });
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
