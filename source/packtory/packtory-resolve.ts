import { Result } from 'true-myth';
import type { CheckRunner } from '../checks/check-runner.ts';
import type { ValidConfigurationWithoutRegistryResult } from '../configuration/validation.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import { analyzeResolvedPackages, type PackageAnalysisDependencies } from './stages/package-analysis-stage.ts';
import { resolvePackages, type PackageResolutionDependencies } from './stages/package-resolution-stage.ts';
import { resolvePartialFailure, type PartialErrorResult } from './packtory-results.ts';
import { buildChecksResult, type CheckError, type ResolvedPackage } from './resolved-package.ts';

export type InternalResolveAndLinkFailure = CheckError | PartialErrorResult;

type ResolveDependencies = PackageAnalysisDependencies & PackageResolutionDependencies;
export type CheckDependencies = ResolveDependencies & {
    readonly versionManager: Pick<VersionManager, 'addVersion'>;
    readonly runChecks: CheckRunner;
};

export function createResolveAndLinkAllValidated(
    dependencies: CheckDependencies
): (
    configuration: ValidConfigurationWithoutRegistryResult
) => Promise<Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>> {
    return async function resolveAndLinkAllValidated(
        configuration: ValidConfigurationWithoutRegistryResult
    ): Promise<Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>> {
        const runResult = await resolvePackages(dependencies, configuration);
        if (runResult.isErr) {
            const succeeded = await analyzeResolvedPackages(dependencies, configuration, runResult.error.succeeded);
            return Result.err(resolvePartialFailure({ succeeded, failures: runResult.error.failures }));
        }

        const resolvedPackages = await analyzeResolvedPackages(dependencies, configuration, runResult.value);
        return await buildChecksResult(dependencies, configuration, resolvedPackages);
    };
}
