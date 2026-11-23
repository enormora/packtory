import { bundledDependenciesFrom } from '../common/bundled-dependency-groups.ts';
import type {
    ChecksSettings as ChecksSettingsBase,
    PackageChecksSettings as PackageChecksSettingsBase
} from './checks-schema.ts';
import type { MainPackageManifest } from './package-manifest.ts';
import type { PackageInterface } from './package-interface.ts';
import type { OptionalPackageSettings } from './optional-package-settings-schema.ts';
import type { Root } from './root.ts';
import type { VersioningSettings } from './versioning-settings.ts';
import type { ChangelogSettings } from './changelog-settings.ts';
import type { RegistrySettings } from './registry-settings.ts';

export type ChecksSettings = ChecksSettingsBase;
export type PackageChecksSettings = PackageChecksSettingsBase;
type CommonPackageSettings = OptionalPackageSettings & {
    readonly sourcesFolder?: string | undefined;
    readonly mainPackageManifest?: MainPackageManifest | undefined;
};

type PackageConfigurationBase = CommonPackageSettings & {
    readonly name: string;
    readonly exportPackageManifest?: true | undefined;
    readonly versioning?: VersioningSettings | undefined;
    readonly bundleDependencies?: readonly string[] | undefined;
    readonly bundlePeerDependencies?: readonly string[] | undefined;
    readonly checks?: PackageChecksSettings | undefined;
};

type ImplicitPackageConfiguration = PackageConfigurationBase & {
    readonly roots: Readonly<Record<string, Root>>;
    readonly defaultModuleRoot?: string | undefined;
    readonly packageInterface?: undefined;
};

type ExplicitPackageConfiguration = PackageConfigurationBase & {
    readonly roots: Readonly<Record<string, Root>>;
    readonly defaultModuleRoot?: undefined;
    readonly packageInterface: PackageInterface;
};

export type PackageConfiguration = ExplicitPackageConfiguration | ImplicitPackageConfiguration;

export type PackageConfigurationsByName = Readonly<Record<string, PackageConfiguration>>;

export type PacktoryConfigurationWithoutRegistry = {
    readonly changelog?: ChangelogSettings | undefined;
    readonly checks?: ChecksSettings | undefined;
    readonly commonPackageSettings?: CommonPackageSettings | undefined;
    readonly packages: readonly PackageConfiguration[];
};

export type PacktoryConfiguration = PacktoryConfigurationWithoutRegistry & {
    readonly registrySettings?: RegistrySettings | undefined;
};

export const getBundledDependencies = bundledDependenciesFrom<string>;
