import { Result } from 'true-myth';
import { packageNameMap } from '../common/package-name-map.ts';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import { analyzeResolvedPackages, type PackageAnalysisDependencies } from './stages/package-analysis-stage.ts';
import { resolvePackages, type PackageResolutionDependencies } from './stages/package-resolution-stage.ts';
import {
    packPackageFailureType,
    resolvePartialFailure,
    type PackPackageFailure,
    type PartialErrorResult
} from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

type PackageInspectionDependencies = PackageAnalysisDependencies & PackageResolutionDependencies;

async function resolvePackageForInspection(
    dependencies: PackageInspectionDependencies,
    validated: ValidConfigWithoutRegistryResult,
    packageName: string
): Promise<Result<ResolvedPackage, PackPackageFailure | PartialErrorResult>> {
    const runResult = await resolvePackages(dependencies, validated);
    if (runResult.isErr) {
        const succeeded = await analyzeResolvedPackages(dependencies, validated, runResult.error.succeeded);
        return Result.err(resolvePartialFailure({ succeeded, failures: runResult.error.failures }));
    }

    const resolvedPackages = await analyzeResolvedPackages(dependencies, validated, runResult.value);
    const resolvedPackagesByName = new Map(packageNameMap(resolvedPackages));
    const target = resolvedPackagesByName.get(packageName);
    if (target === undefined) {
        return Result.err({ type: packPackageFailureType.packageNotFound, packageName });
    }

    return Result.ok(target);
}

export async function inspectResolvedPackageFor<TInspection>(
    dependencies: PackageInspectionDependencies,
    validated: ValidConfigWithoutRegistryResult,
    packageName: string,
    inspect: (target: ResolvedPackage) => TInspection
): Promise<Result<TInspection, PackPackageFailure | PartialErrorResult>> {
    const target = await resolvePackageForInspection(dependencies, validated, packageName);
    if (target.isErr) {
        return Result.err(target.error);
    }

    return Result.ok(inspect(target.value));
}
