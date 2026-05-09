import type { z } from 'zod/mini';
import type { checksPerPackageSchema, checksSchema } from './checks-schema.ts';
import type { AdditionalFileDescription } from './additional-files.ts';
import type { DependencyPolicy } from './dependency-policy.ts';
import type { EntryPoint } from './entry-point.ts';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from './package-json.ts';
import type { PublishSettings } from './publish-settings.ts';
import type { RegistrySettings } from './registry-settings.ts';
import type { VersioningSettings } from './versioning-settings.ts';

export type ChecksSettings = z.infer<typeof checksSchema>;
export type PackageChecksSettings = z.infer<typeof checksPerPackageSchema>;

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
    readonly checks?: PackageChecksSettings | undefined;
};

export type PackageConfigsByName = Readonly<Record<string, PackageConfig>>;

const bundledDependencyPropertyNames = ['bundleDependencies', 'bundlePeerDependencies'] as const;

export function getBundledDependencies(packageConfig: PackageConfig): readonly string[] {
    return bundledDependencyPropertyNames.flatMap((propertyName) => {
        return packageConfig[propertyName] ?? [];
    });
}

type CommonPackageSettings = {
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
