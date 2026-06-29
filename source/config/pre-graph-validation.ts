import { indexBy } from 'remeda';
import type { PackageConfig, PackageConfigsByName, PacktoryConfigWithoutRegistry } from './config.ts';
import { validateChangelogSettings } from './changelog-settings.ts';
import { validateDependenciesExist } from './dependency-existence-validation.ts';
import { validatePackageSurfaceRules } from './root-config-validation.ts';
import { validateAllowScriptsConsistency, validatePublishSettingsArePlaced } from './settings-validation.ts';

export function packageListToRecord(packages: readonly PackageConfig[]): PackageConfigsByName {
    return indexBy(packages, function (packageConfig) {
        return packageConfig.name;
    });
}

export function collectPreGraphIssues(packtoryConfig: PacktoryConfigWithoutRegistry): readonly string[] {
    const packageConfigs = packageListToRecord(packtoryConfig.packages);
    return [
        ...validateChangelogSettings(packtoryConfig),
        ...validatePublishSettingsArePlaced(packtoryConfig),
        ...validateAllowScriptsConsistency(packtoryConfig),
        ...validateDependenciesExist(packageConfigs),
        ...validatePackageSurfaceRules(packageConfigs)
    ];
}
