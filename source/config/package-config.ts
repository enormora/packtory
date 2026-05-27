import { bundledDependenciesFrom } from '../common/bundled-dependency-groups.ts';
import type { AdditionalFileDescription } from './additional-files.ts';
import type { PackageChecksSettings } from './checks-schema.ts';
import type { DeadCodeEliminationSettings } from './dead-code-elimination-settings.ts';
import type { DependencyPolicy } from './dependency-policy.ts';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from './package-json.ts';
import type { PackageInterface } from './package-interface.ts';
import type { PublishSettings } from './publish-settings.ts';
import type { Root } from './root.ts';
import type { VersioningSettings } from './versioning-settings.ts';

export type CommonPackageSettings = {
    readonly sourcesFolder?: string | undefined;
    readonly mainPackageJson?: MainPackageJson | undefined;
    readonly additionalFiles?: readonly AdditionalFileDescription[] | undefined;
    readonly includeSourceMapFiles?: boolean | undefined;
    readonly additionalPackageJsonAttributes?: AdditionalPackageJsonAttributes | undefined;
    readonly publishSettings?: PublishSettings | undefined;
    readonly dependencyPolicy?: DependencyPolicy | undefined;
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
};

type PackageConfigBase = {
    readonly name: string;
    readonly exportPackageJson?: true | undefined;
    readonly versioning?: VersioningSettings | undefined;
    readonly bundleDependencies?: readonly string[] | undefined;
    readonly bundlePeerDependencies?: readonly string[] | undefined;
    readonly sourcesFolder?: string | undefined;
    readonly mainPackageJson?: MainPackageJson | undefined;
    readonly additionalFiles?: readonly AdditionalFileDescription[] | undefined;
    readonly includeSourceMapFiles?: boolean | undefined;
    readonly additionalPackageJsonAttributes?: AdditionalPackageJsonAttributes | undefined;
    readonly publishSettings?: PublishSettings | undefined;
    readonly dependencyPolicy?: DependencyPolicy | undefined;
    readonly checks?: PackageChecksSettings | undefined;
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
};

type ImplicitPackageConfig = PackageConfigBase & {
    readonly roots: Readonly<Record<string, Root>>;
    readonly defaultModuleRoot?: string | undefined;
    readonly packageInterface?: undefined;
};

type ExplicitPackageConfig = PackageConfigBase & {
    readonly roots: Readonly<Record<string, Root>>;
    readonly defaultModuleRoot?: undefined;
    readonly packageInterface: PackageInterface;
};

export type PackageConfig = ExplicitPackageConfig | ImplicitPackageConfig;

export type PackageConfigsByName = Readonly<Record<string, PackageConfig>>;

export const getBundledDependencies = bundledDependenciesFrom<string>;
