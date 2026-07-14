import { bundledDependencyGroups } from '../common/bundled-dependency-groups.ts';
import type { PackageConfig, PackageConfigsByName } from './config.ts';

function dependencyIssues(packageConfig: PackageConfig, knownPackageNames: ReadonlySet<string>): readonly string[] {
    return bundledDependencyGroups().flatMap(function (group) {
        const dependencyNames = packageConfig[group.propertyName] ?? [];
        const missingDependencyNames = dependencyNames.filter(function (dependencyName) {
            return !knownPackageNames.has(dependencyName);
        });

        return missingDependencyNames.map(function (dependencyName) {
            return `${group.missingMessagePrefix} "${dependencyName}" referenced in "${packageConfig.name}" ` +
                'does not exist';
        });
    });
}

export function validateDependenciesExist(packageConfigs: PackageConfigsByName): readonly string[] {
    const knownPackageNames = new Set(Object.keys(packageConfigs));

    return Object.values(packageConfigs).flatMap(function (packageConfig) {
        return dependencyIssues(packageConfig, knownPackageNames);
    });
}
