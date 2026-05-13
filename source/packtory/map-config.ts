import type { PackageConfigsByName, PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import type { BundleSubstitutionSource } from '../linker/linked-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    preparePackageOptions,
    resolvePublishSettings,
    type PublishSettings,
    type SharedPackageOptions,
    type VersioningSettings
} from './prepare-package-options.ts';

export type BuildOptions = SharedPackageOptions<VersionedBundleWithManifest> & {
    readonly version: string;
};

export type BuildAndPublishOptions = SharedPackageOptions<VersionedBundleWithManifest> & {
    readonly registrySettings: PacktoryConfig['registrySettings'];
    readonly publishSettings: PublishSettings;
    readonly versioning: VersioningSettings;
};

export type ResolveAndLinkOptions = SharedPackageOptions<BundleSubstitutionSource>;

export function configToBuildAndPublishOptions(
    packageName: string,
    packageConfigs: PackageConfigsByName,
    packtoryConfig: PacktoryConfig,
    existingBundles: readonly VersionedBundleWithManifest[]
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
