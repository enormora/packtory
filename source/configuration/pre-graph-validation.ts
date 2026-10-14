import { indexBy } from 'remeda';
import type {
    PackageConfiguration,
    PackageConfigurationsByName,
    PacktoryConfigurationWithoutRegistry
} from './configuration.ts';
import { validateChangelogSettings } from './changelog-settings.ts';
import { validateDependenciesExist } from './dependency-existence-validation.ts';
import { validatePackageSurfaceRules } from './root-configuration-validation.ts';
import { validateAllowScriptsConsistency, validatePublishSettingsArePlaced } from './settings-validation.ts';

export function packageListToRecord(packages: readonly PackageConfiguration[]): PackageConfigurationsByName {
    return indexBy(packages, function (packageConfiguration) {
        return packageConfiguration.name;
    });
}

export function collectPreGraphIssues(packtoryConfiguration: PacktoryConfigurationWithoutRegistry): readonly string[] {
    const packageConfigurations = packageListToRecord(packtoryConfiguration.packages);
    return [
        ...validateChangelogSettings(packtoryConfiguration),
        ...validatePublishSettingsArePlaced(packtoryConfiguration),
        ...validateAllowScriptsConsistency(packtoryConfiguration),
        ...validateDependenciesExist(packageConfigurations),
        ...validatePackageSurfaceRules(packageConfigurations)
    ];
}
