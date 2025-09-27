import { Maybe } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.js';
import type { RegistrySettings } from '../config/registry-settings.js';
import type { VersioningSettings } from '../config/versioning-settings.js';
import { compareFileDescriptions } from '../file-manager/compare.js';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.js';
import { extractPackageTarball } from './extract-package-tarball.js';
import type { RegistryClient } from './registry-client.js';

export type BundleEmitterDependencies = {
    readonly artifactsBuilder: ArtifactsBuilder;
    readonly registryClient: RegistryClient;
};

export type PublishOptions = {
    readonly bundle: VersionedBundleWithManifest;
    readonly registrySettings: RegistrySettings;
};

type CurrentVersionLookupOptions = {
    readonly name: string;
    readonly registrySettings: RegistrySettings;
    readonly versioning: VersioningSettings;
};

type BundlePublishedCheckResult = {
    readonly alreadyPublishedAsLatest: boolean;
};

export type BundleEmitter = {
    publish(options: PublishOptions): Promise<void>;
    determineCurrentVersion(options: CurrentVersionLookupOptions): Promise<Maybe<string>>;
    checkBundleAlreadyPublished(options: PublishOptions): Promise<BundlePublishedCheckResult>;
};

export function createBundleEmitter(dependencies: BundleEmitterDependencies): BundleEmitter {
    const { artifactsBuilder, registryClient } = dependencies;

    return {
        async determineCurrentVersion(options) {
            const { versioning, registrySettings, name } = options;

            if (versioning.automatic) {
                const latestVersion = await registryClient.fetchLatestVersion(name, registrySettings);
                return latestVersion.map((version) => {
                    return version.version;
                });
            }

            return Maybe.just(versioning.version);
        },

        async checkBundleAlreadyPublished(options) {
            const { bundle, registrySettings } = options;
            const latestVersion = await registryClient.fetchLatestVersion(bundle.name, registrySettings);
            if (latestVersion.isNothing) {
                return { alreadyPublishedAsLatest: false };
            }

            const artifactContents = artifactsBuilder.collectContents(bundle, 'package');
            const tarball = await registryClient.fetchTarball(
                latestVersion.value.tarballUrl,
                latestVersion.value.shasum
            );
            const latestVersionArtifactContents = await extractPackageTarball(tarball);
            const result = compareFileDescriptions(artifactContents, latestVersionArtifactContents);
            return { alreadyPublishedAsLatest: result.status === 'equal' };
        },

        async publish(options) {
            const tarball = await artifactsBuilder.buildTarball(options.bundle);

            await registryClient.publishPackage(options.bundle.packageJson, tarball.tarData, options.registrySettings);
        }
    };
}
