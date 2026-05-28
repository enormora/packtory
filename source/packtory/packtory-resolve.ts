import { Result } from 'true-myth';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import { analyzeResolvedPackages, type PackageAnalysisDependencies } from './stages/package-analysis-stage.ts';
import { resolvePackages, type PackageResolutionDependencies } from './stages/package-resolution-stage.ts';
import { resolvePartialFailure, type PartialErrorResult } from './packtory-results.ts';
import { buildChecksResult, type CheckError, type ResolvedPackage } from './resolved-package.ts';

export type InternalResolveAndLinkFailure = CheckError | PartialErrorResult;

type ResolveDependencies = PackageAnalysisDependencies & PackageResolutionDependencies;
type CheckDependencies = ResolveDependencies & { readonly versionManager: Pick<VersionManager, 'addVersion'> };

export function createResolveAndLinkAllValidated(
    dependencies: CheckDependencies
): (
    config: ValidConfigWithoutRegistryResult
) => Promise<Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>> {
    return async function resolveAndLinkAllValidated(
        config: ValidConfigWithoutRegistryResult
    ): Promise<Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>> {
        const runResult = await resolvePackages(dependencies, config);
        if (runResult.isErr) {
            const succeeded = await analyzeResolvedPackages(dependencies, config, runResult.error.succeeded);
            return Result.err(resolvePartialFailure({ succeeded, failures: runResult.error.failures }));
        }

        const resolvedPackages = await analyzeResolvedPackages(dependencies, config, runResult.value);
        return await buildChecksResult(dependencies, config, resolvedPackages);
    };
}
