import type { PackageConfig } from '../../config/config.ts';
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
