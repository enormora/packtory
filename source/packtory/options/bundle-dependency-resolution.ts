import {
    getBundledDependencies,
    type PackageConfiguration,
    type PackageConfigurationsByName
} from '../../configuration/configuration.ts';
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

function packageConfigurationByName(
    packageName: string,
    packageConfigurations: PackageConfigurationsByName
): PackageConfiguration {
    const packageConfiguration = packageConfigurations[packageName];
    if (packageConfiguration === undefined) {
        throw new Error(`Config for package "${packageName}" is missing`);
    }
    return packageConfiguration;
}

export function resolveBundleDependencies<TBundle extends { readonly name: string; }>(
    packageConfiguration: PackageConfiguration,
    existingBundles: readonly TBundle[]
): ResolvedBundleDependencies<TBundle> {
    const bundlesByName = packageNameMap(existingBundles);

    return {
        bundleDependencies: dependencyNamesToBundles(packageConfiguration.bundleDependencies ?? [], bundlesByName),
        bundlePeerDependencies: dependencyNamesToBundles(
            packageConfiguration.bundlePeerDependencies ?? [],
            bundlesByName
        )
    };
}

function collectBundleDependencyClosureNames(
    packageName: string,
    packageConfigurations: PackageConfigurationsByName
): readonly string[] {
    const dependencyNames = new Set([ packageName ]);
    dependencyNames.forEach(function (currentPackageName) {
        const packageConfiguration = packageConfigurationByName(currentPackageName, packageConfigurations);
        for (const dependencyName of getBundledDependencies(packageConfiguration)) {
            dependencyNames.add(dependencyName);
        }
    });
    dependencyNames.delete(packageName);
    return Array.from(dependencyNames);
}

export function resolveBundleDependencyClosure<TBundle extends { readonly name: string; }>(
    packageConfiguration: PackageConfiguration,
    packageConfigurations: PackageConfigurationsByName,
    existingBundles: readonly TBundle[]
): readonly TBundle[] {
    const dependencyNames = collectBundleDependencyClosureNames(packageConfiguration.name, packageConfigurations);
    return dependencyNamesToBundles(dependencyNames, packageNameMap(existingBundles));
}
