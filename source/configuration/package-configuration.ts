import { bundledDependenciesFrom } from '../common/bundled-dependency-groups.ts';
import type { AdditionalFileDescription } from './additional-files.ts';
import type { PackageChecksSettings } from './checks-schema.ts';
import type { DeadCodeEliminationSettings } from './dead-code-elimination-settings.ts';
import type { DependencyPolicy } from './dependency-policy.ts';
import type { AdditionalPackageManifestAttributes, MainPackageManifest } from './package-manifest.ts';
import type { PackageInterface } from './package-interface.ts';
import type { PublishSettings } from './publish-settings.ts';
import type { Root } from './root.ts';
import type { VersioningSettings } from './versioning-settings.ts';

export type CommonPackageSettings = {
    readonly sourcesFolder?: string | undefined;
    readonly mainPackageManifest?: MainPackageManifest | undefined;
    readonly additionalChangelogSourceFiles?: readonly string[] | undefined;
    readonly additionalFiles?: readonly AdditionalFileDescription[] | undefined;
    readonly includeSourceMapFiles?: boolean | undefined;
    readonly additionalPackageManifestAttributes?: AdditionalPackageManifestAttributes | undefined;
    readonly publishSettings?: PublishSettings | undefined;
    readonly dependencyPolicy?: DependencyPolicy | undefined;
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
};

type PackageConfigurationBase = {
    readonly name: string;
    readonly exportPackageManifest?: true | undefined;
    readonly versioning?: VersioningSettings | undefined;
    readonly bundleDependencies?: readonly string[] | undefined;
    readonly bundlePeerDependencies?: readonly string[] | undefined;
    readonly sourcesFolder?: string | undefined;
    readonly mainPackageManifest?: MainPackageManifest | undefined;
    readonly additionalChangelogSourceFiles?: readonly string[] | undefined;
    readonly additionalFiles?: readonly AdditionalFileDescription[] | undefined;
    readonly includeSourceMapFiles?: boolean | undefined;
    readonly additionalPackageManifestAttributes?: AdditionalPackageManifestAttributes | undefined;
    readonly publishSettings?: PublishSettings | undefined;
    readonly dependencyPolicy?: DependencyPolicy | undefined;
    readonly checks?: PackageChecksSettings | undefined;
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
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

export const getBundledDependencies = bundledDependenciesFrom<string>;
