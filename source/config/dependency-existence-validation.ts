import type { PackageConfigsByName } from './config.ts';

function validateDependenciesExistForSinglePackage(
    packageName: string,
    allKnownPackageNames: readonly string[],
    dependencies: readonly string[],
    isPeer: boolean
): readonly string[] {
    const prefix = isPeer ? 'Bundle peer' : 'Bundle';
    return dependencies
        .filter((dependency) => {
            return !allKnownPackageNames.includes(dependency);
        })
        .map((dependency) => {
            return `${prefix} dependency "${dependency}" referenced in "${packageName}" does not exist`;
        });
}

export function validateDependenciesExist(packageConfigs: PackageConfigsByName): readonly string[] {
    const knownPackageNames = Object.keys(packageConfigs);
    return Object.values(packageConfigs).flatMap((packageConfig) => {
        return [
            ...validateDependenciesExistForSinglePackage(
                packageConfig.name,
                knownPackageNames,
                packageConfig.bundleDependencies ?? [],
                false
            ),
            ...validateDependenciesExistForSinglePackage(
                packageConfig.name,
                knownPackageNames,
                packageConfig.bundlePeerDependencies ?? [],
                true
            )
        ];
    });
}
