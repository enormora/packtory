/* eslint-disable import/max-dependencies -- the publish/check flow legitimately depends on registry, artifacts, file-manager, and provenance helpers */
import { Maybe } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { provenanceType, publishAccess, type PublishSettings } from '../config/publish-settings.ts';
import type { RegistrySettings } from '../config/registry-settings.ts';
import type { VersioningSettings } from '../config/versioning-settings.ts';
import { compareFileDescriptions, fileDescriptionComparisonStatus } from '../file-manager/compare.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { ArtifactPublishPackage } from '../published-package/published-package.ts';
import { canonicalizeSbomInFileSet } from '../sbom/sbom-canonicalizer.ts';
import { fetchPublishedArtifacts, type PublishedReleaseArtifacts } from './fetch-published-artifacts.ts';
import type { RegistryClient } from './registry/registry-client.ts';
import { assertRepositoryCoherence } from './repository-coherence.ts';

export type BundleEmitterDependencies = {
    readonly artifactsBuilder: ArtifactsBuilder;
    readonly registryClient: RegistryClient;
    readonly ciRepositoryUrl: string | undefined;
};

type PublishOptions = {
    readonly bundle: ArtifactPublishPackage;
    readonly registrySettings: RegistrySettings;
    readonly publishSettings: PublishSettings;
    readonly extraFiles?: readonly FileDescription[];
};

type AlreadyPublishedCheckOptions = {
    readonly bundle: ArtifactPublishPackage;
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
    readonly previousReleaseArtifacts: Maybe<PublishedReleaseArtifacts>;
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
            const previous = await fetchPublishedArtifacts(registryClient, bundle.name, registrySettings);
            if (previous.isNothing) {
                return { alreadyPublishedAsLatest: false, previousReleaseArtifacts: Maybe.nothing() };
            }

            const artifactContents = artifactsBuilder.collectContents(bundle, 'package', extraFiles);
            const comparison = compareFileDescriptions(
                canonicalizeSbomInFileSet(artifactContents),
                canonicalizeSbomInFileSet(previous.value.files)
            );
            return {
                alreadyPublishedAsLatest: comparison.status === fileDescriptionComparisonStatus.equal,
                previousReleaseArtifacts: previous
            };
        },

        async publish(options) {
            if (
                options.publishSettings.access === publishAccess.public &&
                options.publishSettings.provenance?.type === provenanceType.auto
            ) {
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
