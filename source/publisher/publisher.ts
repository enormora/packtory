import type { Maybe } from 'true-myth';
import type { Except } from 'type-fest';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.js';
import type { BundleBuildOptions } from '../bundler/bundle-build-options.js';
import type { BundleDescription } from '../bundler/bundle-description.js';
import type { Bundler } from '../bundler/bundler.js';
import type { PackageVersionDetails, RegistryClient, RegistrySettings } from './registry-client.js';
import { increaseVersion, type Version, replaceBundleVersion } from './version.js';

type AutomaticVersioningSettings = {
    readonly automatic: true;
    readonly minimumVersion?: Version;
};

type ManualVersioningSettings = {
    readonly automatic: false;
    readonly version: string;
};

type VersioningSettings = AutomaticVersioningSettings | ManualVersioningSettings;

export type PublisherDependencies = {
    readonly artifactsBuilder: ArtifactsBuilder;
    readonly registryClient: RegistryClient;
    readonly bundler: Bundler;
};

type BuildOptions = Except<BundleBuildOptions, 'version'>;

type BuildAndPublishOptions = BuildOptions & {
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

type PublishResult = Except<BuildResult, 'tarData'>;

export type Publisher = {
    tryBuildAndPublish(options: Readonly<BuildAndPublishOptions>): Promise<BuildResult>;
    buildAndPublish(options: Readonly<BuildAndPublishOptions>): Promise<PublishResult>;
};

type BundlePublishedCheckResult = {
    readonly alreadyPublishedAsLatest: boolean;
};

export function createPublisher(dependencies: Readonly<PublisherDependencies>): Publisher {
    const { artifactsBuilder, registryClient, bundler } = dependencies;

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

    async function buildWithAutomaticVersioning(
        buildOptions: BuildOptions,
        latestVersion: Readonly<Maybe<PackageVersionDetails>>,
        minimumVersion: Version = '0.0.1'
    ): Promise<BuildResult> {
        if (latestVersion.isNothing) {
            return buildVersion(buildOptions, minimumVersion, 'initial-version');
        }

        const bundleWithLatestVersion = await bundler.build({ ...buildOptions, version: latestVersion.value.version });
        const result = await checkBundleAlreadyPublished(bundleWithLatestVersion, latestVersion.value);

        if (!result.alreadyPublishedAsLatest) {
            const newVersion = increaseVersion(latestVersion.value.version, minimumVersion);
            const bundleWithNewVersion = replaceBundleVersion(bundleWithLatestVersion, newVersion);
            const tarballWithNewVersion = await artifactsBuilder.buildTarball(bundleWithNewVersion);
            return {
                status: 'new-version',
                tarData: tarballWithNewVersion.tarData,
                bundle: bundleWithNewVersion
            };
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
