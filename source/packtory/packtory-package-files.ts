import type { ValidConfigurationWithoutRegistryResult } from '../configuration/validation.ts';
import type { PackageAnalysisDependencies } from './stages/package-analysis-stage.ts';
import type { PackageResolutionDependencies } from './stages/package-resolution-stage.ts';
import { inspectFileDiscovery } from './package-file-discovery.ts';
import { inspectResolvedPackageFor } from './packtory-package-inspection.ts';
import type { PackageFileInspectionResult } from './packtory-results.ts';

type PackageFileInspectionDependencies = PackageAnalysisDependencies & PackageResolutionDependencies & {
    readonly repositoryFolder: string;
};

export function createInspectPackageFilesValidated(
    dependencies: PackageFileInspectionDependencies
): (
    validated: ValidConfigurationWithoutRegistryResult,
    packageName: string
) => Promise<PackageFileInspectionResult> {
    return async function inspectPackageFilesValidated(validated, packageName) {
        return await inspectResolvedPackageFor(dependencies, validated, packageName, function (target, linkedBundle) {
            return {
                packageName: target.name,
                files: inspectFileDiscovery(linkedBundle, target.analyzedBundle.contents, dependencies.repositoryFolder)
            };
        });
    };
}
