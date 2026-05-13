import type {
    ChecksSettings as ChecksSettingsBase,
    PackageChecksSettings as PackageChecksSettingsBase
} from './checks-schema.ts';
import {
    getBundledDependencies as getBundledDependenciesBase,
    type CommonPackageSettings as CommonPackageSettingsBase,
    type PackageConfig as PackageConfigBase,
    type PackageConfigsByName as PackageConfigsByNameBase
} from './package-config.ts';
import type { RegistrySettings } from './registry-settings.ts';

export type ChecksSettings = ChecksSettingsBase;
export type PackageChecksSettings = PackageChecksSettingsBase;
export type PackageConfig = PackageConfigBase;
export type PackageConfigsByName = PackageConfigsByNameBase;
export type PacktoryConfigWithoutRegistry = {
    readonly checks?: ChecksSettings | undefined;
    readonly commonPackageSettings?: CommonPackageSettingsBase | undefined;
    readonly packages: readonly PackageConfig[];
};

export type PacktoryConfig = PacktoryConfigWithoutRegistry & {
    readonly registrySettings: RegistrySettings;
};

const packageConfigOperations = {
    getBundledDependencies: getBundledDependenciesBase
};

export const { getBundledDependencies } = packageConfigOperations;
