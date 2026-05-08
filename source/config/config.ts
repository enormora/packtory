import type { AdditionalFileDescription } from './additional-files.ts';
import type { DependencyPolicy } from './dependency-policy.ts';
import type { EntryPoint } from './entry-point.ts';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from './package-json.ts';
import type { PublishSettings } from './publish-settings.ts';
import type { RegistrySettings } from './registry-settings.ts';
import type { VersioningSettings } from './versioning-settings.ts';

export type ScopedAllowListEntry = {
    readonly filePath: string;
    readonly packages: readonly string[];
};

export type AllowListEntry = ScopedAllowListEntry | string;

export type NoDuplicatedFilesSettings = {
    readonly enabled: boolean;
    readonly allowList?: readonly AllowListEntry[] | undefined;
};

export type ChecksSettings = {
    readonly noDuplicatedFiles?: NoDuplicatedFilesSettings | undefined;
};

export type PackageConfig = {
    readonly name: string;
    readonly entryPoints: readonly EntryPoint[];
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
};

export type PackageConfigsByName = Readonly<Record<string, PackageConfig>>;

const bundledDependencyPropertyNames = ['bundleDependencies', 'bundlePeerDependencies'] as const;

export function getBundledDependencies(packageConfig: PackageConfig): readonly string[] {
    return bundledDependencyPropertyNames.flatMap((propertyName) => {
        return packageConfig[propertyName] ?? [];
    });
}

export type CommonPackageSettings = {
    readonly sourcesFolder?: string | undefined;
    readonly mainPackageJson?: MainPackageJson | undefined;
    readonly additionalFiles?: readonly AdditionalFileDescription[] | undefined;
    readonly includeSourceMapFiles?: boolean | undefined;
    readonly additionalPackageJsonAttributes?: AdditionalPackageJsonAttributes | undefined;
    readonly publishSettings?: PublishSettings | undefined;
    readonly dependencyPolicy?: DependencyPolicy | undefined;
};

export type PacktoryConfigWithoutRegistry = {
    readonly checks?: ChecksSettings | undefined;
    readonly commonPackageSettings?: CommonPackageSettings | undefined;
    readonly packages: readonly PackageConfig[];
};

export type PacktoryConfig = PacktoryConfigWithoutRegistry & {
    readonly registrySettings: RegistrySettings;
};
