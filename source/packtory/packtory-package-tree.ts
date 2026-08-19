import { Result } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { packageNameMap } from '../common/package-name-map.ts';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import { collectPublicModuleUsage } from '../package-surface/public-module-usage.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import { packPackageFailureType, type PackageTreeResult, type ResolveAndLinkFailure } from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

type ResolveAndLinkAllValidated = (
    config: ValidConfigWithoutRegistryResult
) => Promise<Result<readonly ResolvedPackage[], ResolveAndLinkFailure>>;

type PackageTreeDependencies = {
    readonly artifactsBuilder: Pick<ArtifactsBuilder, 'collectContents'>;
    readonly versionManager: Pick<VersionManager, 'addVersion'>;
};

const treeManifestVersionPrefix = '0.0';
const treeManifestVersion = `${treeManifestVersionPrefix}.0`;

function versionedDependenciesForTree(
    dependencies: readonly { readonly name: string; }[]
): readonly { readonly name: string; readonly version: string; }[] {
    return dependencies.map(function (dependency) {
        return { name: dependency.name, version: treeManifestVersion };
    });
}

function inspectTreePackage(
    dependencies: PackageTreeDependencies,
    target: ResolvedPackage,
    publicModuleUsage: ReadonlyMap<string, ReadonlySet<string>>
): void {
    const { analyzedBundle, resolveOptions } = target;
    const substitutionPublicModuleSourcePaths = publicModuleUsage.get(target.name);
    const versionedBundle = dependencies.versionManager.addVersion({
        bundle: analyzedBundle,
        version: treeManifestVersion,
        mainPackageJson: resolveOptions.mainPackageJson,
        bundleDependencies: versionedDependenciesForTree(resolveOptions.bundleDependencies),
        bundlePeerDependencies: versionedDependenciesForTree(resolveOptions.bundlePeerDependencies),
        additionalPackageJsonAttributes: resolveOptions.additionalPackageJsonAttributes,
        allowMutableSpecifiers: resolveOptions.allowMutableSpecifiers,
        substitutionPublicModuleSourcePaths
    });
    dependencies.artifactsBuilder.collectContents(versionedBundle);
}

export function createInspectPackageTreeValidated(
    dependencies: PackageTreeDependencies
): (
    validated: ValidConfigWithoutRegistryResult,
    packageName: string,
    resolveAndLinkAllValidated: ResolveAndLinkAllValidated,
    selectEntries: (packageName: string) => PackageTreeResult
) => Promise<PackageTreeResult> {
    return async function inspectPackageTreeValidated(
        validated,
        packageName,
        resolveAndLinkAllValidated,
        selectEntries
    ) {
        const resolved = await resolveAndLinkAllValidated(validated);
        if (resolved.isErr) {
            return Result.err(resolved.error);
        }

        const resolvedPackagesByName = new Map(packageNameMap(resolved.value));
        const target = resolvedPackagesByName.get(packageName);
        if (target === undefined) {
            return Result.err({ type: packPackageFailureType.packageNotFound, packageName });
        }

        inspectTreePackage(
            dependencies,
            target,
            collectPublicModuleUsage(resolved.value.map(function (resolvedPackage) {
                return resolvedPackage.analyzedBundle;
            }))
        );
        return selectEntries(packageName);
    };
}
