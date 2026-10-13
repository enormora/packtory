import type { PackageConfiguration, PacktoryConfigurationWithoutRegistry } from '../../configuration/configuration.ts';
import type { AdditionalPackageManifestAttributes, MainPackageManifest } from '../../configuration/package-manifest.ts';
import {
    resolveDeadCodeEliminationSettings,
    type DeadCodeEliminationSettings
} from '../../configuration/dead-code-elimination-settings.ts';
import type { ResourceResolveOptions } from '../../resource-resolver/resource-resolve-options.ts';
import { normalizeAdditionalFile } from '../normalize-paths.ts';
import { getRequiredValue } from './required-value-helpers.ts';

export type PublishSettings = NonNullable<PackageConfiguration['publishSettings']>;

type AdditionalFileDescription = Extract<
    ResourceResolveOptions['additionalFiles'][number],
    { readonly inputFilePath: string; readonly targetFilePath: string; }
>;

export function resolveSourcesFolder(
    packageConfiguration: PackageConfiguration,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry
): string {
    return getRequiredValue(
        packageConfiguration.sourcesFolder ?? packtoryConfiguration.commonPackageSettings?.sourcesFolder,
        `Config for package "${packageConfiguration.name}" is missing the sources folder`
    );
}

export function resolveMainPackageManifest(
    packageConfiguration: PackageConfiguration,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry
): MainPackageManifest {
    return getRequiredValue(
        packageConfiguration.mainPackageManifest ?? packtoryConfiguration.commonPackageSettings?.mainPackageManifest,
        `Config for package "${packageConfiguration.name}" is missing the main package.json settings`
    );
}

export function resolvePublishSettings(
    packageConfiguration: PackageConfiguration,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry
): PublishSettings {
    return getRequiredValue(
        packageConfiguration.publishSettings ?? packtoryConfiguration.commonPackageSettings?.publishSettings,
        `Config for package "${packageConfiguration.name}" is missing publish settings`
    );
}

export function resolveAllowMutableSpecifiers(
    packageConfiguration: PackageConfiguration,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry
): readonly string[] {
    const dependencyPolicy = packageConfiguration.dependencyPolicy ??
        packtoryConfiguration.commonPackageSettings?.dependencyPolicy;
    return dependencyPolicy?.allowMutableSpecifiers ?? [];
}

export type AdditionalChangelogSourceFiles = {
    readonly packageFiles: readonly string[];
    readonly sharedFiles: readonly string[];
};

export function resolveAdditionalChangelogSourceFiles(
    packageConfiguration: PackageConfiguration,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry
): AdditionalChangelogSourceFiles {
    return {
        packageFiles: packageConfiguration.additionalChangelogSourceFiles ?? [],
        sharedFiles: packtoryConfiguration.commonPackageSettings?.additionalChangelogSourceFiles ?? []
    };
}

export function buildAdditionalPackageManifestAttributes(
    packageConfiguration: PackageConfiguration,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry
): AdditionalPackageManifestAttributes {
    return {
        ...packtoryConfiguration.commonPackageSettings?.additionalPackageManifestAttributes,
        ...packageConfiguration.additionalPackageManifestAttributes
    };
}

export function resolveIncludeSourceMapFiles(
    packageConfiguration: PackageConfiguration,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry
): boolean {
    return packageConfiguration.includeSourceMapFiles ?? packtoryConfiguration
        .commonPackageSettings
        ?.includeSourceMapFiles ??
        false;
}

function mergeAdditionalFilesByTarget(
    firstFiles: readonly AdditionalFileDescription[] = [],
    secondFiles: readonly AdditionalFileDescription[] = []
): readonly AdditionalFileDescription[] {
    const result = new Map<string, AdditionalFileDescription>();
    for (const file of [ ...firstFiles, ...secondFiles ]) {
        result.set(file.targetFilePath, file);
    }
    return Array.from(result.values());
}

export function resolveAdditionalFiles(
    packageConfiguration: PackageConfiguration,
    sourcesFolder: string,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry
): readonly AdditionalFileDescription[] {
    const merged: readonly AdditionalFileDescription[] = mergeAdditionalFilesByTarget(
        packtoryConfiguration.commonPackageSettings?.additionalFiles,
        packageConfiguration.additionalFiles
    );
    return merged.map(function (additionalFile) {
        return normalizeAdditionalFile(additionalFile, sourcesFolder);
    });
}

export function resolveDeadCodeElimination(
    packageConfiguration: PackageConfiguration,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry
): DeadCodeEliminationSettings | undefined {
    return resolveDeadCodeEliminationSettings(
        packageConfiguration.deadCodeElimination,
        packtoryConfiguration.commonPackageSettings?.deadCodeElimination
    );
}
