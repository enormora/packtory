import { indexBy } from 'remeda';
import type { PackageConfig } from '../../config/config.ts';

function dependencyNamesToBundles<TBundle extends { name: string }>(
    dependencyNames: readonly string[],
    bundles: readonly TBundle[]
): readonly TBundle[] {
    const bundlesByName = indexBy(bundles, (bundle) => {
        return bundle.name;
    });

    return dependencyNames.map((dependencyName) => {
        const matchingBundle = bundlesByName[dependencyName];
        if (matchingBundle === undefined) {
            throw new Error(`Dependent bundle "${dependencyName}" not found`);
        }
        return matchingBundle;
    });
}

export function resolveBundleDependencies<TBundle extends { name: string }>(
    packageConfig: PackageConfig,
    existingBundles: readonly TBundle[]
): {
    readonly bundleDependencies: readonly TBundle[];
    readonly bundlePeerDependencies: readonly TBundle[];
} {
    return {
        bundleDependencies: dependencyNamesToBundles(packageConfig.bundleDependencies ?? [], existingBundles),
        bundlePeerDependencies: dependencyNamesToBundles(packageConfig.bundlePeerDependencies ?? [], existingBundles)
    };
}
