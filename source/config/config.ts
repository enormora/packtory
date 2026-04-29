import type { AdditionalFileDescription } from './additional-files.ts';
import type { EntryPoint } from './entry-point.ts';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from './package-json.ts';
import type { RegistrySettings } from './registry-settings.ts';
import type { VersioningSettings } from './versioning-settings.ts';

export type NoDuplicatedFilesSettings = {
    readonly enabled: boolean;
    readonly allowList?: readonly string[] | undefined;
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
};

export const bundledDependencyPropertyNames = ['bundleDependencies', 'bundlePeerDependencies'] as const;

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
};

export type PacktoryConfigWithoutRegistry = {
    readonly checks?: ChecksSettings | undefined;
    readonly commonPackageSettings?: CommonPackageSettings | undefined;
    readonly packages: readonly PackageConfig[];
};

export type PacktoryConfig = PacktoryConfigWithoutRegistry & {
    readonly registrySettings: RegistrySettings;
};
