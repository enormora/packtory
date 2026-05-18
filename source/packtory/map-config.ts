import type { PackageConfigsByName, PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import type { BundleSubstitutionSource } from '../linker/linked-bundle.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';
import {
    preparePackageOptions,
    type SharedPackageOptions,
    type VersioningSettings
} from './options/prepare-package-options.ts';
import { resolvePublishSettings, type PublishSettings } from './options/setting-resolvers.ts';

export type BuildOptions = SharedPackageOptions<PublishedPackageWithManifest> & {
    readonly version: string;
};

export type BuildAndPublishOptions = SharedPackageOptions<PublishedPackageWithManifest> & {
    readonly registrySettings: PacktoryConfig['registrySettings'];
    readonly publishSettings: PublishSettings;
    readonly versioning: VersioningSettings;
};

export type ResolveAndLinkOptions = SharedPackageOptions<BundleSubstitutionSource>;

export function configToBuildAndPublishOptions(
    packageName: string,
    packageConfigs: PackageConfigsByName,
    packtoryConfig: PacktoryConfig,
    existingBundles: readonly PublishedPackageWithManifest[]
): BuildAndPublishOptions {
    const { packageConfig, sharedOptions, versioning } = preparePackageOptions(
        packageName,
        packageConfigs,
        packtoryConfig,
        existingBundles
    );
    const publishSettings = resolvePublishSettings(packageConfig, packtoryConfig);

    return {
        ...sharedOptions,
        versioning,
        registrySettings: packtoryConfig.registrySettings,
        publishSettings
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
