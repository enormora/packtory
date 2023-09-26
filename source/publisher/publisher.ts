import { Maybe } from 'true-myth';
import { Except, PackageJson, SetRequired } from 'type-fest';
import { ArtifactsBuilder } from '../artifacts/artifacts-builder.js';
import { BundleBuildOptions } from '../bundler/bundle-build-options.js';
import { BundleDescription } from '../bundler/bundle-description.js';
import { Bundler } from '../bundler/bundler.js';
import { PackageVersionDetails, RegistryClient, RegistrySettings } from './registry-client.js';
import { increaseVersion, Version, replaceBundleVersion } from './version.js';

interface AutomaticVersioningSettings {
    readonly automatic: true;
    readonly minimumVersion?: Version;
}

interface ManualVersioningSettings {
    readonly automatic: false;
    readonly version: string;
}

type VersioningSettings = AutomaticVersioningSettings | ManualVersioningSettings;

export interface PublisherDependencies {
    readonly artifactsBuilder: ArtifactsBuilder;
    readonly registryClient: RegistryClient;
    bundler: Bundler;
}

type BuildOptions = Except<BundleBuildOptions, 'version'>;

interface BuildAndPublishOptions extends BuildOptions {
    versioning?: VersioningSettings;
    registrySettings: RegistrySettings;
}

interface NewVersionToPublishResult {
    type: 'new-version' | 'initial-version';
    manifest: SetRequired<PackageJson, 'name' | 'version'>;
    bundle: BundleDescription;
    tarData: Buffer;
}

interface LatestVersionAlreadyPublishedResult {
    type: 'already-published';
    manifest: SetRequired<PackageJson, 'name' | 'version'>;
    bundle: BundleDescription;
    tarData?: undefined;
}

type BuildResult = NewVersionToPublishResult | LatestVersionAlreadyPublishedResult;

interface PublishResult {
    status: BuildResult['type'];
    version: string;
    bundle: BundleDescription;
}

export interface Publisher {
    tryBuildAndPublish(options: BuildAndPublishOptions): Promise<BuildResult>;
    buildAndPublish(options: BuildAndPublishOptions): Promise<PublishResult>;
}

interface BundlePublishedCheckResult {
    alreadyPublishedAsLatest: boolean;
}

export function createPublisher(dependencies: PublisherDependencies): Publisher {
    const { artifactsBuilder, registryClient, bundler } = dependencies;

    async function checkBundleAlreadyPublished(
        bundle: BundleDescription,
        latestVersion: PackageVersionDetails,
    ): Promise<BundlePublishedCheckResult> {
        const tarball = await artifactsBuilder.buildTarball(bundle);
        return { alreadyPublishedAsLatest: latestVersion.shasum === tarball.shasum };
    }

    async function buildWithAutomaticVersioning(
        buildOptions: BuildOptions,
        latestVersion: Maybe<PackageVersionDetails>,
        minimumVersion: Version = '0.0.1',
    ): Promise<BuildResult> {
        if (latestVersion.isNothing) {
            const initialVersion = minimumVersion;

            const bundle = await bundler.build({ ...buildOptions, version: initialVersion });
            const tarball = await artifactsBuilder.buildTarball(bundle);

            return { type: 'initial-version', manifest: bundle.packageJson, tarData: tarball.tarData, bundle };
        }

        const bundleWithLatestVersion = await bundler.build({ ...buildOptions, version: latestVersion.value.version });
        const result = await checkBundleAlreadyPublished(bundleWithLatestVersion, latestVersion.value);

        if (!result.alreadyPublishedAsLatest) {
            const newVersion = increaseVersion(latestVersion.value.version, minimumVersion);
            const bundleWithNewVersion = replaceBundleVersion(bundleWithLatestVersion, newVersion);
            const tarballWithNewVersion = await artifactsBuilder.buildTarball(bundleWithNewVersion);
            return {
                type: 'new-version',
                manifest: bundleWithNewVersion.packageJson,
                tarData: tarballWithNewVersion.tarData,
                bundle: bundleWithNewVersion,
            };
        }

        return {
            type: 'already-published',
            manifest: bundleWithLatestVersion.packageJson,
            bundle: bundleWithLatestVersion,
        };
    }

    async function buildWithManualVersioning(
        buildOptions: BuildOptions,
        latestVersion: Maybe<PackageVersionDetails>,
        versionToPublish: string,
    ): Promise<BuildResult> {
        if (latestVersion.isJust && latestVersion.value.version === versionToPublish) {
            throw new Error(`Version ${versionToPublish} of package ${buildOptions.name} is already published`);
        }

        const bundle = await bundler.build({ ...buildOptions, version: versionToPublish });
        const tarball = await artifactsBuilder.buildTarball(bundle);

        return { type: 'new-version', manifest: bundle.packageJson, tarData: tarball.tarData, bundle };
    }

    async function tryBuildAndPublish(options: BuildAndPublishOptions): Promise<BuildResult> {
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

            if (result.type !== 'already-published') {
                await registryClient.publishPackage(result.manifest, result.tarData, options.registrySettings);
            }

            return {
                status: result.type,
                version: result.manifest.version,
                bundle: result.bundle,
            };
        },
    };
}
