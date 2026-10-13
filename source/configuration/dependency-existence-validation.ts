import { bundledDependencyGroups } from '../common/bundled-dependency-groups.ts';
import type { PackageConfiguration, PackageConfigurationsByName } from './configuration.ts';

function dependencyIssues(
    packageConfiguration: PackageConfiguration,
    knownPackageNames: ReadonlySet<string>
): readonly string[] {
    return bundledDependencyGroups().flatMap(function (group) {
        const dependencyNames = packageConfiguration[group.propertyName] ?? [];
        const missingDependencyNames = dependencyNames.filter(function (dependencyName) {
            return !knownPackageNames.has(dependencyName);
        });

        return missingDependencyNames.map(function (dependencyName) {
            return `${group.missingMessagePrefix} "${dependencyName}" referenced in "${packageConfiguration.name}" ` +
                'does not exist';
        });
    });
}

export function validateDependenciesExist(packageConfigurations: PackageConfigurationsByName): readonly string[] {
    const knownPackageNames = new Set(Object.keys(packageConfigurations));

    return Object.values(packageConfigurations).flatMap(function (packageConfiguration) {
        return dependencyIssues(packageConfiguration, knownPackageNames);
    });
}
