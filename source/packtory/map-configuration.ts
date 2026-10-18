import type {
    PackageConfigurationsByName,
    PacktoryConfiguration,
    PacktoryConfigurationWithoutRegistry
} from '../configuration/configuration.ts';
import type { SourceManualVersioningSettings, VersionProvider } from '../configuration/manual-versioning-settings.ts';
import { hasVersionSource } from '../configuration/versioning-settings.ts';
import type { BundleSubstitutionSource } from '../linker/linked-bundle.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';
import {
    preparePackageOptions,
    type SharedPackageOptions,
    type VersioningSettings
} from './options/prepare-package-options.ts';
import { resolveBundleDependencyClosure } from './options/bundle-dependency-resolution.ts';
import { collectGeneratedAttributionPaths } from './generated-attribution-paths.ts';
import {
    resolvePublishSettings,
    type AdditionalChangelogSourceFiles,
    type PublishSettings
} from './options/setting-resolvers.ts';

type PublishVersioningSettings = Exclude<VersioningSettings, SourceManualVersioningSettings>;

export type BuildOptions = SharedPackageOptions<PublishedPackageWithManifest> & {
    readonly version: string;
};

type PackageAttributionOptions = {
    readonly additionalChangelogSourceFiles: AdditionalChangelogSourceFiles;
};

type BuildAndPublishSharedOptions = PackageAttributionOptions & SharedPackageOptions<PublishedPackageWithManifest>;

export type BuildAndPublishOptions = BuildAndPublishSharedOptions & {
    readonly bundleDependencyClosure: readonly PublishedPackageWithManifest[];
    readonly registrySettings: NonNullable<PacktoryConfiguration['registrySettings']>;
    readonly publishSettings: PublishSettings;
    readonly versioning: PublishVersioningSettings;
    readonly ignoredAttributionPaths: readonly string[];
};

export type ResolveAndLinkOptions = PackageAttributionOptions & SharedPackageOptions<BundleSubstitutionSource>;

export type BuildAndPublishMappingContext = {
    readonly existingBundles: readonly PublishedPackageWithManifest[];
    readonly repositoryFolder?: string | undefined;
    readonly resolveVersionSource?: VersionSourceResolver | undefined;
};

type VersionSourceResolverInput = {
    readonly packageName: string;
    readonly source: SourceManualVersioningSettings;
    readonly packtoryConfiguration: PacktoryConfiguration;
};

export type VersionSourceResolver = (input: VersionSourceResolverInput) => VersionProvider;

function resolveVersioning(
    packageName: string,
    versioning: VersioningSettings,
    packtoryConfiguration: PacktoryConfiguration,
    resolveVersionSource: VersionSourceResolver | undefined
): PublishVersioningSettings {
    if (!hasVersionSource(versioning)) {
        return versioning;
    }
    if (resolveVersionSource === undefined) {
        throw new Error(`Manual version source "${versioning.source}" is not available`);
    }
    return {
        automatic: false,
        provideVersion: resolveVersionSource({ packageName, source: versioning, packtoryConfiguration })
    };
}

export function configurationToBuildAndPublishOptions(
    packageName: string,
    packageConfigurations: PackageConfigurationsByName,
    packtoryConfiguration: PacktoryConfiguration,
    context: BuildAndPublishMappingContext
): BuildAndPublishOptions {
    const { additionalChangelogSourceFiles, packageConfiguration, sharedOptions, versioning } = preparePackageOptions(
        packageName,
        packageConfigurations,
        packtoryConfiguration,
        context.existingBundles
    );
    const publishSettings = resolvePublishSettings(packageConfiguration, packtoryConfiguration);

    return {
        ...sharedOptions,
        additionalChangelogSourceFiles,
        bundleDependencyClosure: resolveBundleDependencyClosure(
            packageConfiguration,
            packageConfigurations,
            context.existingBundles
        ),
        versioning: resolveVersioning(packageName, versioning, packtoryConfiguration, context.resolveVersionSource),
        registrySettings: packtoryConfiguration.registrySettings ?? {},
        publishSettings,
        ignoredAttributionPaths: collectGeneratedAttributionPaths(
            context.repositoryFolder ?? '/',
            packtoryConfiguration
        )
    };
}

export function configurationToResolveAndLinkOptions(
    packageName: string,
    packageConfigurations: PackageConfigurationsByName,
    packtoryConfiguration: PacktoryConfigurationWithoutRegistry,
    existingBundles: readonly BundleSubstitutionSource[]
): ResolveAndLinkOptions {
    const { additionalChangelogSourceFiles, sharedOptions } = preparePackageOptions(
        packageName,
        packageConfigurations,
        packtoryConfiguration,
        existingBundles
    );

    return {
        ...sharedOptions,
        additionalChangelogSourceFiles
    };
}
