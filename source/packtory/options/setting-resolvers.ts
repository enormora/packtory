import type { PackageConfig, PacktoryConfigWithoutRegistry } from '../../config/config.ts';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from '../../config/package-json.ts';
import {
    resolveDeadCodeEliminationSettings,
    type DeadCodeEliminationSettings
} from '../../config/dead-code-elimination-settings.ts';
import type { ResourceResolveOptions } from '../../resource-resolver/resource-resolve-options.ts';
import { normalizeAdditionalFile } from '../normalize-paths.ts';
import { getRequiredValue } from './required-value-helpers.ts';

export type PublishSettings = NonNullable<PackageConfig['publishSettings']>;

type AdditionalFileDescription = Extract<
    ResourceResolveOptions['additionalFiles'][number],
    { readonly sourceFilePath: string; readonly targetFilePath: string }
>;

export function resolveSourcesFolder(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): string {
    return getRequiredValue(
        packageConfig.sourcesFolder ?? packtoryConfig.commonPackageSettings?.sourcesFolder,
        `Config for package "${packageConfig.name}" is missing the sources folder`
    );
}

export function resolveMainPackageJson(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): MainPackageJson {
    return getRequiredValue(
        packageConfig.mainPackageJson ?? packtoryConfig.commonPackageSettings?.mainPackageJson,
        `Config for package "${packageConfig.name}" is missing the main package.json settings`
    );
}

export function resolvePublishSettings(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): PublishSettings {
    return getRequiredValue(
        packageConfig.publishSettings ?? packtoryConfig.commonPackageSettings?.publishSettings,
        `Config for package "${packageConfig.name}" is missing publish settings`
    );
}

export function resolveAllowMutableSpecifiers(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): readonly string[] {
    const dependencyPolicy = packageConfig.dependencyPolicy ?? packtoryConfig.commonPackageSettings?.dependencyPolicy;
    return dependencyPolicy?.allowMutableSpecifiers ?? [];
}

export function resolveAdditionalChangelogSourceFiles(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): readonly string[] {
    return [
        ...(packtoryConfig.commonPackageSettings?.additionalChangelogSourceFiles ?? []),
        ...(packageConfig.additionalChangelogSourceFiles ?? [])
    ];
}

export function buildAdditionalPackageJsonAttributes(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): AdditionalPackageJsonAttributes {
    return {
        ...packtoryConfig.commonPackageSettings?.additionalPackageJsonAttributes,
        ...packageConfig.additionalPackageJsonAttributes
    };
}

export function resolveIncludeSourceMapFiles(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): boolean {
    return packageConfig.includeSourceMapFiles ?? packtoryConfig.commonPackageSettings?.includeSourceMapFiles ?? false;
}

function mergeAdditionalFilesByTarget(
    firstFiles: readonly AdditionalFileDescription[] = [],
    secondFiles: readonly AdditionalFileDescription[] = []
): readonly AdditionalFileDescription[] {
    const result = new Map<string, AdditionalFileDescription>();
    for (const file of [...firstFiles, ...secondFiles]) {
        result.set(file.targetFilePath, file);
    }
    return Array.from(result.values());
}

export function resolveAdditionalFiles(
    packageConfig: PackageConfig,
    sourcesFolder: string,
    packtoryConfig: PacktoryConfigWithoutRegistry
): readonly AdditionalFileDescription[] {
    const merged: readonly AdditionalFileDescription[] = mergeAdditionalFilesByTarget(
        packtoryConfig.commonPackageSettings?.additionalFiles,
        packageConfig.additionalFiles
    );
    return merged.map((additionalFile) => {
        return normalizeAdditionalFile(additionalFile, sourcesFolder);
    });
}

export function resolveDeadCodeElimination(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): DeadCodeEliminationSettings | undefined {
    return resolveDeadCodeEliminationSettings(
        packageConfig.deadCodeElimination,
        packtoryConfig.commonPackageSettings?.deadCodeElimination
    );
}
