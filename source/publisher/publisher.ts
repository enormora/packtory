import type { Maybe } from 'true-myth';
import type { Except } from 'type-fest';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.js';
import type { BundleBuildOptions } from '../bundler/bundle-build-options.js';
import type { BundleDescription } from '../bundler/bundle-description.js';
import type { Bundler } from '../bundler/bundler.js';
import type { VersioningSettings } from '../config/versioning-settings.js';
import type { RegistrySettings } from '../config/registry-settings.js';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.js';
import type { PackageVersionDetails, RegistryClient } from './registry-client.js';
// eslint-disable-next-line import/max-dependencies -- needs to be fixed but I don’t have a good idea yet
import { increaseVersion, replaceBundleVersion } from './version.js';

export type PublisherDependencies = {
    readonly artifactsBuilder: ArtifactsBuilder;
    readonly registryClient: RegistryClient;
    readonly bundler: Bundler;
    readonly progressBroadcaster: ProgressBroadcastProvider;
};

type BuildOptions = Except<BundleBuildOptions, 'version'>;

export type BuildAndPublishOptions = BuildOptions & {
    readonly versioning?: VersioningSettings;
    readonly registrySettings: RegistrySettings;
};

type NewVersionToPublishResult = {
    readonly status: 'initial-version' | 'new-version';
    readonly bundle: BundleDescription;
    readonly tarData: Buffer;
};

type LatestVersionAlreadyPublishedResult = {
    readonly status: 'already-published';
    readonly bundle: BundleDescription;
    readonly tarData?: undefined;
};

type BuildResult = Readonly<LatestVersionAlreadyPublishedResult | NewVersionToPublishResult>;
type NewVersionResultStatus = NewVersionToPublishResult['status'];

export type PublishResult = Except<BuildResult, 'tarData'>;

export type Publisher = {
    tryBuildAndPublish(options: BuildAndPublishOptions): Promise<BuildResult>;
    buildAndPublish(options: BuildAndPublishOptions): Promise<PublishResult>;
};

type BundlePublishedCheckResult = {
    readonly alreadyPublishedAsLatest: boolean;
};

export function createPublisher(dependencies: Readonly<PublisherDependencies>): Publisher {
    const { artifactsBuilder, registryClient, bundler, progressBroadcaster } = dependencies;

    async function checkBundleAlreadyPublished(
        bundle: BundleDescription,
        latestVersion: Readonly<PackageVersionDetails>
    ): Promise<BundlePublishedCheckResult> {
        const tarball = await artifactsBuilder.buildTarball(bundle);
        return { alreadyPublishedAsLatest: latestVersion.shasum === tarball.shasum };
    }

    async function buildVersion(
        buildOptions: BuildOptions,
        version: string,
        status: NewVersionResultStatus
    ): Promise<BuildResult> {
        const bundle = await bundler.build({ ...buildOptions, version });
        const tarball = await artifactsBuilder.buildTarball(bundle);

        return { status, tarData: tarball.tarData, bundle };
    }

    async function buildNewVersion(
        buildOptions: BuildOptions,
        latestVersion: string,
        bundleWithLatestVersion: BundleDescription,
        minimumVersion = '0.0.1'
    ): Promise<BuildResult> {
        const newVersion = increaseVersion(latestVersion, minimumVersion);
        progressBroadcaster.emit('rebuilding', { packageName: buildOptions.name, version: newVersion });
        const bundleWithNewVersion = replaceBundleVersion(bundleWithLatestVersion, newVersion);
        const tarballWithNewVersion = await artifactsBuilder.buildTarball(bundleWithNewVersion);
        return {
            status: 'new-version',
            tarData: tarballWithNewVersion.tarData,
            bundle: bundleWithNewVersion
        };
    }

    async function buildWithAutomaticVersioning(
        buildOptions: BuildOptions,
        latestVersion: Readonly<Maybe<PackageVersionDetails>>,
        minimumVersion = '0.0.1'
    ): Promise<BuildResult> {
        if (latestVersion.isNothing) {
            progressBroadcaster.emit('building', { packageName: buildOptions.name, version: minimumVersion });
            return buildVersion(buildOptions, minimumVersion, 'initial-version');
        }

        progressBroadcaster.emit('building', { packageName: buildOptions.name, version: latestVersion.value.version });
        const bundleWithLatestVersion = await bundler.build({ ...buildOptions, version: latestVersion.value.version });
        const result = await checkBundleAlreadyPublished(bundleWithLatestVersion, latestVersion.value);

        if (!result.alreadyPublishedAsLatest) {
            return buildNewVersion(buildOptions, latestVersion.value.version, bundleWithLatestVersion, minimumVersion);
        }

        return { status: 'already-published', bundle: bundleWithLatestVersion };
    }

    async function buildWithManualVersioning(
        buildOptions: BuildOptions,
        latestVersion: Readonly<Maybe<PackageVersionDetails>>,
        versionToPublish: string
    ): Promise<BuildResult> {
        if (latestVersion.isJust && latestVersion.value.version === versionToPublish) {
            throw new Error(`Version ${versionToPublish} of package ${buildOptions.name} is already published`);
        }

        progressBroadcaster.emit('building', { packageName: buildOptions.name, version: versionToPublish });
        return buildVersion(buildOptions, versionToPublish, 'new-version');
    }

    async function tryBuildAndPublish(options: Readonly<BuildAndPublishOptions>): Promise<BuildResult> {
        const { versioning = { automatic: true }, registrySettings, ...buildOptions } = options;

        const latestVersion = await registryClient.fetchLatestVersion(buildOptions.name, registrySettings);
        if (versioning.automatic) {
            return buildWithAutomaticVersioning(buildOptions, latestVersion, versioning.minimumVersion);
        }

        return buildWithManualVersioning(buildOptions, latestVersion, versioning.version);
    }

    return {
        tryBuildAndPublish,

        async buildAndPublish(options) {
            const result = await tryBuildAndPublish(options);

            if (result.status !== 'already-published') {
                progressBroadcaster.emit('publishing', {
                    packageName: result.bundle.packageJson.name,
                    version: result.bundle.packageJson.version
                });
                await registryClient.publishPackage(
                    result.bundle.packageJson,
                    result.tarData,
                    options.registrySettings
                );
            }

            return { status: result.status, bundle: result.bundle };
        }
    };
}
