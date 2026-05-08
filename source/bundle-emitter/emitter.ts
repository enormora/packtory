/* eslint-disable import/max-dependencies -- the publish/check flow legitimately depends on registry, artifacts, file-manager, and provenance helpers */
import { Maybe } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { PublishSettings } from '../config/publish-settings.ts';
import type { RegistrySettings } from '../config/registry-settings.ts';
import type { VersioningSettings } from '../config/versioning-settings.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import { compareFileDescriptions } from '../file-manager/compare.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { extractPackageTarball } from './extract-package-tarball.ts';
import type { RegistryClient } from './registry-client.ts';
import { assertRepositoryCoherence } from './repository-coherence.ts';

export type BundleEmitterDependencies = {
    readonly artifactsBuilder: ArtifactsBuilder;
    readonly registryClient: RegistryClient;
    readonly ciRepositoryUrl: string | undefined;
};

type PublishOptions = {
    readonly bundle: VersionedBundleWithManifest;
    readonly registrySettings: RegistrySettings;
    readonly publishSettings: PublishSettings;
    readonly extraFiles?: readonly FileDescription[];
};

type AlreadyPublishedCheckOptions = {
    readonly bundle: VersionedBundleWithManifest;
    readonly registrySettings: RegistrySettings;
    readonly extraFiles?: readonly FileDescription[];
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
    publish: (options: PublishOptions) => Promise<void>;
    determineCurrentVersion: (options: CurrentVersionLookupOptions) => Promise<Maybe<string>>;
    checkBundleAlreadyPublished: (options: AlreadyPublishedCheckOptions) => Promise<BundlePublishedCheckResult>;
};

export function createBundleEmitter(dependencies: BundleEmitterDependencies): BundleEmitter {
    const { artifactsBuilder, registryClient, ciRepositoryUrl } = dependencies;

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
            const { bundle, registrySettings, extraFiles } = options;
            const latestVersion = await registryClient.fetchLatestVersion(bundle.name, registrySettings);
            if (latestVersion.isNothing) {
                return { alreadyPublishedAsLatest: false };
            }

            const artifactContents = artifactsBuilder.collectContents(bundle, 'package', extraFiles);
            const tarball = await registryClient.fetchTarball(latestVersion.value.tarballUrl, registrySettings);
            const latestVersionArtifactContents = await extractPackageTarball(tarball);
            const result = compareFileDescriptions(artifactContents, latestVersionArtifactContents);
            return { alreadyPublishedAsLatest: result.status === 'equal' };
        },

        async publish(options) {
            if (options.publishSettings.access === 'public' && options.publishSettings.provenance?.type === 'auto') {
                assertRepositoryCoherence(options.bundle.packageJson, ciRepositoryUrl);
            }

            const tarball = await artifactsBuilder.buildTarball(options.bundle, options.extraFiles);

            await registryClient.publishPackage(
                options.bundle.packageJson,
                tarball.tarData,
                options.registrySettings,
                options.publishSettings
            );
        }
    };
}
