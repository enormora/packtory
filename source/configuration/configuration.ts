import type {
    ChecksSettings as ChecksSettingsBase,
    PackageChecksSettings as PackageChecksSettingsBase
} from './checks-schema.ts';
import {
    getBundledDependencies as getBundledDependenciesBase,
    type CommonPackageSettings as CommonPackageSettingsBase,
    type PackageConfiguration as PackageConfigurationBase,
    type PackageConfigurationsByName as PackageConfigurationsByNameBase
} from './package-configuration.ts';
import type { ChangelogSettings } from './changelog-settings.ts';
import type { RegistrySettings } from './registry-settings.ts';

export type ChecksSettings = ChecksSettingsBase;
export type PackageChecksSettings = PackageChecksSettingsBase;
export type PackageConfiguration = PackageConfigurationBase;
export type PackageConfigurationsByName = PackageConfigurationsByNameBase;
export type PacktoryConfigurationWithoutRegistry = {
    readonly changelog?: ChangelogSettings | undefined;
    readonly checks?: ChecksSettings | undefined;
    readonly commonPackageSettings?: CommonPackageSettingsBase | undefined;
    readonly packages: readonly PackageConfiguration[];
};

export type PacktoryConfiguration = PacktoryConfigurationWithoutRegistry & {
    readonly registrySettings?: RegistrySettings | undefined;
};

const packageConfigurationOperations = { getBundledDependencies: getBundledDependenciesBase };
export const { getBundledDependencies } = packageConfigurationOperations;
