import { Result } from 'true-myth';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import { analyzeResolvedPackages, type PackageAnalysisDependencies } from './stages/package-analysis-stage.ts';
import { resolvePackages, type PackageResolutionDependencies } from './stages/package-resolution-stage.ts';
import { resolvePartialFailure, type PartialErrorResult } from './packtory-results.ts';
import { buildChecksResult, type CheckError, type ResolvedPackage } from './resolved-package.ts';

export type InternalResolveAndLinkFailure = CheckError | PartialErrorResult;

type ResolveDependencies = PackageAnalysisDependencies & PackageResolutionDependencies;

export function createResolveAndLinkAllValidated(
    dependencies: ResolveDependencies
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
        return buildChecksResult(config, resolvedPackages);
    };
}
