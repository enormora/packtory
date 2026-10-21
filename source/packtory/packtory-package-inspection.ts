import { Result } from 'true-myth';
import { zip } from 'remeda';
import type { ValidConfigurationWithoutRegistryResult } from '../configuration/validation.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { analyzeResolvedPackages, type PackageAnalysisDependencies } from './stages/package-analysis-stage.ts';
import { resolvePackages, type PackageResolutionDependencies } from './stages/package-resolution-stage.ts';
import {
    packPackageFailureType,
    resolvePartialFailure,
    type PackPackageFailure,
    type PartialErrorResult
} from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

type InspectionTarget = {
    readonly resolved: ResolvedPackage;
    readonly linkedBundle: LinkedBundle;
};

type PackageInspectionDependencies = PackageAnalysisDependencies & PackageResolutionDependencies;

function selectInspectionTarget(
    resolvedPackages: readonly ResolvedPackage[],
    linkedPackages: readonly { readonly name: string; readonly linkedBundle: LinkedBundle; }[],
    packageName: string
): Result<InspectionTarget, PackPackageFailure> {
    const target = zip(resolvedPackages, linkedPackages).find(function ([ resolved ]) {
        return resolved.name === packageName;
    });
    if (target === undefined) {
        return Result.err({ type: packPackageFailureType.packageNotFound, packageName });
    }
    const [ resolved, linkedPackage ] = target;
    return Result.ok({ resolved, linkedBundle: linkedPackage.linkedBundle });
}

async function resolvePackageForInspection(
    dependencies: PackageInspectionDependencies,
    validated: ValidConfigurationWithoutRegistryResult,
    packageName: string
): Promise<Result<InspectionTarget, PackPackageFailure | PartialErrorResult>> {
    const runResult = await resolvePackages(dependencies, validated);
    if (runResult.isErr) {
        const succeeded = await analyzeResolvedPackages(dependencies, validated, runResult.error.succeeded);
        return Result.err(resolvePartialFailure({ succeeded, failures: runResult.error.failures }));
    }

    const resolvedPackages = await analyzeResolvedPackages(dependencies, validated, runResult.value);
    return selectInspectionTarget(resolvedPackages, runResult.value, packageName);
}

export async function inspectResolvedPackageFor<TInspection>(
    dependencies: PackageInspectionDependencies,
    validated: ValidConfigurationWithoutRegistryResult,
    packageName: string,
    inspect: (target: ResolvedPackage, linkedBundle: LinkedBundle) => TInspection
): Promise<Result<TInspection, PackPackageFailure | PartialErrorResult>> {
    const target = await resolvePackageForInspection(dependencies, validated, packageName);
    if (target.isErr) {
        return Result.err(target.error);
    }

    return Result.ok(inspect(target.value.resolved, target.value.linkedBundle));
}
