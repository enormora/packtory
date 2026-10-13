import type {
    PackageConfiguration,
    PackageConfigurationsByName,
    PacktoryConfigurationWithoutRegistry
} from '../../configuration/configuration.ts';
import type { AdditionalPackageManifestAttributes, MainPackageManifest } from '../../configuration/package-manifest.ts';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import type { ResourceResolveOptions } from '../../resource-resolver/resource-resolve-options.ts';
import { normalizeRoot } from '../normalize-paths.ts';
import { resolveBundleDependencies } from './bundle-dependency-resolution.ts';
import { getRequiredArrayValue, mapRequiredArrayValue } from './required-value-helpers.ts';
import {
    buildAdditionalPackageManifestAttributes,
    resolveAdditionalFiles,
    resolveAdditionalChangelogSourceFiles,
    resolveAllowMutableSpecifiers,
    resolveDeadCodeElimination,
    resolveIncludeSourceMapFiles,
    resolveMainPackageManifest,
    resolveSourcesFolder,
    type AdditionalChangelogSourceFiles
} from './setting-resolvers.ts';
import { resolveSurface } from './surface-resolution.ts';

export type VersioningSettings = NonNullable<PackageConfiguration['versioning']>;

export type SharedPackageOptions<TBundle extends { readonly name: string; }> = {
    readonly additionalPackageManifestAttributes: AdditionalPackageManifestAttributes;
    readonly allowMutableSpecifiers: readonly string[];
    readonly mainPackageManifest: MainPackageManifest;
    readonly sourcesFolder: ResourceResolveOptions['sourcesFolder'];
    readonly name: ResourceResolveOptions['name'];
    readonly exportPackageManifest?: ResourceResolveOptions['exportPackageManifest'];
    readonly includeSourceMapFiles: ResourceResolveOptions['includeSourceMapFiles'];
    readonly additionalFiles: ResourceResolveOptions['additionalFiles'];
    readonly roots: ResourceResolveOptions['roots'];
    readonly surface?: ResourceResolveOptions['surface'];
    readonly bundleDependencies: readonly TBundle[];
    readonly bundlePeerDependencies: readonly TBundle[];
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
};

export type PreparedPackageOptions<TBundle extends { readonly name: string; }> = {
    readonly additionalChangelogSourceFiles: AdditionalChangelogSourceFiles;
    readonly packageConfiguration: PackageConfiguration;
    readonly sharedOptions: SharedPackageOptions<TBundle>;
    readonly versioning: VersioningSettings;
};

function getPackageConfiguration(
    packageName: string,
    packageConfigurations: PackageConfigurationsByName
): PackageConfiguration {
    const packageConfiguration = packageConfigurations[packageName];
    if (packageConfiguration === undefined) {
        throw new Error(`Config for package "${packageName}" is missing`);
    }
    return packageConfiguration;
}

function buildSharedOptions<TBundle extends { readonly name: string; }>(
    packageConfiguration: PackageConfiguration,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry,
    existingBundles: readonly TBundle[]
): SharedPackageOptions<TBundle> {
    const sourcesFolder = resolveSourcesFolder(packageConfiguration, packtoryConfiguration);
    const mainPackageManifest = resolveMainPackageManifest(packageConfiguration, packtoryConfiguration);
    const bundleDependencies = resolveBundleDependencies(packageConfiguration, existingBundles);
    const normalizedRootEntries = getRequiredArrayValue(
        Object.entries(packageConfiguration.roots).map(function ([ rootIdentifier, root ]) {
            return [ rootIdentifier, normalizeRoot(root, sourcesFolder) ] as const;
        }),
        `Package "${packageConfiguration.name}" must define at least one root`
    );

    const roots = Object.fromEntries(normalizedRootEntries) as ResourceResolveOptions['roots'];
    const rootIdentifiers = mapRequiredArrayValue(normalizedRootEntries, function ([ rootIdentifier ]) {
        return rootIdentifier;
    });
    const surface = resolveSurface(rootIdentifiers, packageConfiguration);

    return {
        name: packageConfiguration.name,
        exportPackageManifest: packageConfiguration.exportPackageManifest,
        roots,
        surface,
        sourcesFolder,
        includeSourceMapFiles: resolveIncludeSourceMapFiles(packageConfiguration, packtoryConfiguration),
        additionalFiles: resolveAdditionalFiles(packageConfiguration, sourcesFolder, packtoryConfiguration),
        mainPackageManifest,
        additionalPackageManifestAttributes: buildAdditionalPackageManifestAttributes(
            packageConfiguration,
            packtoryConfiguration
        ),
        allowMutableSpecifiers: resolveAllowMutableSpecifiers(packageConfiguration, packtoryConfiguration),
        deadCodeElimination: resolveDeadCodeElimination(packageConfiguration, packtoryConfiguration),
        ...bundleDependencies
    };
}

export function preparePackageOptions<TBundle extends { readonly name: string; }>(
    packageName: string,
    packageConfigurations: PackageConfigurationsByName,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry,
    existingBundles: readonly TBundle[]
): PreparedPackageOptions<TBundle> {
    const packageConfiguration = getPackageConfiguration(packageName, packageConfigurations);
    const sharedOptions = buildSharedOptions(packageConfiguration, packtoryConfiguration, existingBundles);
    const additionalChangelogSourceFiles = resolveAdditionalChangelogSourceFiles(
        packageConfiguration,
        packtoryConfiguration
    );
    const versioning = packageConfiguration.versioning ?? { automatic: true };

    return { additionalChangelogSourceFiles, packageConfiguration, sharedOptions, versioning };
}
