import { bundledDependencyGroups } from '../common/bundled-dependency-groups.ts';
import type { PackageConfigsByName } from './config.ts';

export function validateDependenciesExist(packageConfigs: PackageConfigsByName): readonly string[] {
    const issues: string[] = [];
    const knownPackageNames = new Set(Object.keys(packageConfigs));

    for (const packageConfig of Object.values(packageConfigs)) {
        for (const group of bundledDependencyGroups()) {
            for (const dependencyName of packageConfig[group.propertyName] ?? []) {
                if (!knownPackageNames.has(dependencyName)) {
                    const message =
                        `${group.missingMessagePrefix} "${dependencyName}" referenced in "${packageConfig.name}" ` +
                        'does not exist';
                    issues.push(message);
                }
            }
        }
    }

    return issues;
}
