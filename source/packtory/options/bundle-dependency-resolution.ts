import {
    getBundledDependencies,
    type PackageConfig,
    type PackageConfigsByName
} from '../../config/config.ts';
import { packageNameMap } from '../../common/package-name-map.ts';

function dependencyNamesToBundles<TBundle extends { readonly name: string; }>(
    dependencyNames: readonly string[],
    bundlesByName: ReadonlyMap<string, TBundle>
): readonly TBundle[] {
    return dependencyNames.map(function (dependencyName) {
        const matchingBundle = bundlesByName.get(dependencyName);
        if (matchingBundle === undefined) {
            throw new Error(`Dependent bundle "${dependencyName}" not found`);
        }
        return matchingBundle;
    });
}

type ResolvedBundleDependencies<TBundle extends { readonly name: string; }> = {
    readonly bundleDependencies: readonly TBundle[];
    readonly bundlePeerDependencies: readonly TBundle[];
};

function packageConfigByName(packageName: string, packageConfigs: PackageConfigsByName): PackageConfig {
    const packageConfig = packageConfigs[packageName];
    if (packageConfig === undefined) {
        throw new Error(`Config for package "${packageName}" is missing`);
    }
    return packageConfig;
}

export function resolveBundleDependencies<TBundle extends { readonly name: string; }>(
    packageConfig: PackageConfig,
    existingBundles: readonly TBundle[]
): ResolvedBundleDependencies<TBundle> {
    const bundlesByName = packageNameMap(existingBundles);

    return {
        bundleDependencies: dependencyNamesToBundles(packageConfig.bundleDependencies ?? [], bundlesByName),
        bundlePeerDependencies: dependencyNamesToBundles(packageConfig.bundlePeerDependencies ?? [], bundlesByName)
    };
}

function collectBundleDependencyClosureNames(
    packageName: string,
    packageConfigs: PackageConfigsByName
): readonly string[] {
    const visitedNames = new Set([ packageName ]);
    const dependencyNames: string[] = [];
    const pendingPackageNames = [ packageName ];

    function scheduleDependency(dependencyName: string): void {
        if (visitedNames.has(dependencyName)) {
            return;
        }
        visitedNames.add(dependencyName);
        dependencyNames.push(dependencyName);
        pendingPackageNames.push(dependencyName);
    }

    for (const currentPackageName of pendingPackageNames) {
        const packageConfig = packageConfigByName(currentPackageName, packageConfigs);
        for (const dependencyName of getBundledDependencies(packageConfig)) {
            scheduleDependency(dependencyName);
        }
    }
    return dependencyNames;
}

export function resolveBundleDependencyClosure<TBundle extends { readonly name: string; }>(
    packageConfig: PackageConfig,
    packageConfigs: PackageConfigsByName,
    existingBundles: readonly TBundle[]
): readonly TBundle[] {
    const dependencyNames = collectBundleDependencyClosureNames(packageConfig.name, packageConfigs);
    return dependencyNamesToBundles(dependencyNames, packageNameMap(existingBundles));
}
