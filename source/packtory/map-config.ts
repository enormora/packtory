import type { PackageConfigsByName, PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import type { SourceManualVersioningSettings, VersionProvider } from '../config/manual-versioning-settings.ts';
import { hasVersionSource } from '../config/versioning-settings.ts';
import type { BundleSubstitutionSource } from '../linker/linked-bundle.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';
import {
    preparePackageOptions,
    type SharedPackageOptions,
    type VersioningSettings
} from './options/prepare-package-options.ts';
import { collectGeneratedAttributionPaths } from './generated-attribution-paths.ts';
import { resolvePublishSettings, type PublishSettings } from './options/setting-resolvers.ts';

type PublishVersioningSettings = Exclude<VersioningSettings, SourceManualVersioningSettings>;

export type BuildOptions = SharedPackageOptions<PublishedPackageWithManifest> & {
    readonly version: string;
};

export type BuildAndPublishOptions = SharedPackageOptions<PublishedPackageWithManifest> & {
    readonly registrySettings: NonNullable<PacktoryConfig['registrySettings']>;
    readonly publishSettings: PublishSettings;
    readonly versioning: PublishVersioningSettings;
    readonly ignoredAttributionPaths: readonly string[];
};

export type ResolveAndLinkOptions = SharedPackageOptions<BundleSubstitutionSource>;

export type BuildAndPublishMappingContext = {
    readonly existingBundles: readonly PublishedPackageWithManifest[];
    readonly repositoryFolder?: string | undefined;
    readonly resolveVersionSource?: VersionSourceResolver | undefined;
};

export type VersionSourceResolver = (input: {
    readonly packageName: string;
    readonly source: SourceManualVersioningSettings;
    readonly packtoryConfig: PacktoryConfig;
}) => VersionProvider;

function resolveVersioning(
    packageName: string,
    versioning: VersioningSettings,
    packtoryConfig: PacktoryConfig,
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
        provideVersion: resolveVersionSource({ packageName, source: versioning, packtoryConfig })
    };
}

export function configToBuildAndPublishOptions(
    packageName: string,
    packageConfigs: PackageConfigsByName,
    packtoryConfig: PacktoryConfig,
    context: BuildAndPublishMappingContext
): BuildAndPublishOptions {
    const { packageConfig, sharedOptions, versioning } = preparePackageOptions(
        packageName,
        packageConfigs,
        packtoryConfig,
        context.existingBundles
    );
    const publishSettings = resolvePublishSettings(packageConfig, packtoryConfig);

    return {
        ...sharedOptions,
        versioning: resolveVersioning(packageName, versioning, packtoryConfig, context.resolveVersionSource),
        registrySettings: packtoryConfig.registrySettings ?? {},
        publishSettings,
        ignoredAttributionPaths: collectGeneratedAttributionPaths(context.repositoryFolder ?? '/', packtoryConfig)
    };
}

export function configToResolveAndLinkOptions(
    packageName: string,
    packageConfigs: PackageConfigsByName,
    packtoryConfig: PacktoryConfigWithoutRegistry,
    existingBundles: readonly BundleSubstitutionSource[]
): ResolveAndLinkOptions {
    const { sharedOptions } = preparePackageOptions(packageName, packageConfigs, packtoryConfig, existingBundles);

    return sharedOptions;
}
