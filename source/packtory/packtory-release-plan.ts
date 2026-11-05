import { Result } from 'true-myth';
import type { ValidConfigurationResult } from '../configuration/validation.ts';
import type { CurrentGitHeadReader } from '../git/current-git-head.ts';
import type {
    ReleasePlanPackage,
    ReleasePlanResult
} from './packtory-results.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import { prepareRelease, type ResolveReleasePackages } from './prepared-release.ts';
import {
    createReleasePlanPackage,
    type CollectReleaseArtifactFiles,
    type ReleasePlanMapperDependencies
} from './release-plan.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import { classifyPackageRelease } from './release-analysis.ts';
import type { PublishStageDependencies } from './stages/publish-stage.ts';

type ReleasePlanArtifactDependencies = {
    readonly artifactsBuilder: { readonly collectContents: CollectReleaseArtifactFiles; };
};
type ReleasePlanPublishingDependencies = PublishStageDependencies & ReleasePlanArtifactDependencies;
type ReleasePlanOrchestratorDependencies = ReleasePlanMapperDependencies & ReleasePlanPublishingDependencies;
type ReleasePlanDependencies = ReleasePlanOrchestratorDependencies & {
    readonly readCurrentGitHead: CurrentGitHeadReader;
};

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

async function createPackagePlan(input: CreatePackagePlanInput): Promise<ReleasePlanPackage> {
    const packageName = input.buildResult.bundle.name;
    const resolvedPackage = input.resolvedPackagesByName.get(packageName);
    if (resolvedPackage === undefined) {
        throw new Error(`Resolved package "${packageName}" is missing`);
    }
    const releaseArtifactFiles = input.artifactsBuilder.collectContents(
        input.buildResult.bundle,
        'package',
        input.buildResult.extraFiles
    );
    return createReleasePlanPackage(input, resolvedPackage.analyzedBundle, input.buildResult, {
        changelogSourceOptions: resolvedPackage.resolveOptions,
        currentGitHead: input.currentGitHead,
        releaseArtifactFiles,
        releaseClassification: classifyPackageRelease(input.buildResult, releaseArtifactFiles).classification
    });
}

export function createPlanReleaseAgainstLatestPublishedValidated(
    dependencies: ReleasePlanDependencies
): (
    validated: ValidConfigurationResult,
    resolveAndLinkAllValidated: ResolveReleasePackages
) => Promise<ReleasePlanResult> {
    return async function planReleaseAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated) {
        const prepared = await prepareRelease(dependencies, validated, resolveAndLinkAllValidated);
        if (prepared.isErr) {
            return Result.err(prepared.error);
        }
        const currentGitHead = await dependencies.readCurrentGitHead();
        const resolvedPackagesByName = resolvedPackagesByNameFrom(prepared.value.resolvedPackages);
        const plan = await prepared.value.project(async function (buildResult) {
            return createPackagePlan({ ...dependencies, buildResult, currentGitHead, resolvedPackagesByName });
        });
        return plan.map(function (packages) {
            return { packages };
        });
    };
}
