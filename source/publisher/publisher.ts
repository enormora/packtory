import {Maybe} from 'true-myth';
import {Except, PackageJson, SetRequired} from 'type-fest';
import {ArtifactsBuilder} from '../artifacts/artifacts-builder.js';
import {BundleBuildOptions} from '../bundler/bundle-build-options.js';
import {BundleDescription} from '../bundler/bundle-description.js';
import {Bundler} from '../bundler/bundler.js';
import {RegistryClient} from './registry-client.js';
import {increaseVersion, Version, replaceBundleVersion} from './version.js';

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
    bundler: Bundler
}

type BuildOptions = Except<BundleBuildOptions, 'version'>

interface BuildAndPublishOptions extends BuildOptions {
    versioning?: VersioningSettings;
}

interface NewVersionToPublishResult {
    type: 'new-version'
    manifest: SetRequired<PackageJson, 'name' | 'version'>;
    tarData: Buffer;
}

interface LatestVersionAlreadyPublishedResult {
    type: 'already-published'
    manifest?: undefined
    tarData?: undefined
}

type BuildResult = NewVersionToPublishResult | LatestVersionAlreadyPublishedResult;

export interface Publisher {
    tryBuildAndPublish(options: BuildAndPublishOptions): Promise<BuildResult>
    buildAndPublish(options: BuildAndPublishOptions): Promise<void>
}

interface BundlePublishedCheckResult {
    alreadyPublishedAsLatest: boolean;
}

export function createPublisher(dependencies: PublisherDependencies): Publisher {
    const {artifactsBuilder, registryClient, bundler} = dependencies;

    async function checkBundleAlreadyPublished(name: string, bundle: BundleDescription, latestVersion: string): Promise<BundlePublishedCheckResult> {
        const tarball = await artifactsBuilder.buildTarball(bundle);
        const shasumForLatestPublishedVersion = await registryClient.fetchShasum(name, latestVersion);
        return {alreadyPublishedAsLatest: shasumForLatestPublishedVersion !== tarball.shasum}
    }

    async function buildWithAutomaticVersioning(buildOptions: BuildOptions, latestVersion: Maybe<string>, minimumVersion: Version = '0.0.1'): Promise<BuildResult> {
        if (latestVersion.isNothing) {
            const initialVersion = minimumVersion

            const bundle = await bundler.build({...buildOptions, version: initialVersion})
            const tarball = await artifactsBuilder.buildTarball(bundle)

            return {type: 'new-version', manifest: bundle.packageJson, tarData: tarball.tarData};
        }

        const bundleWithLatestVersion = await bundler.build({...buildOptions, version: latestVersion.value})
        const result = await checkBundleAlreadyPublished(buildOptions.name, bundleWithLatestVersion, latestVersion.value);

        if (!result.alreadyPublishedAsLatest) {
            const newVersion = increaseVersion(latestVersion.value, minimumVersion);
            const bundleWithNewVersion = replaceBundleVersion(bundleWithLatestVersion, newVersion);
            const tarballWithNewVersion = await artifactsBuilder.buildTarball(bundleWithNewVersion);
            return {type: 'new-version', manifest: bundleWithNewVersion.packageJson, tarData: tarballWithNewVersion.tarData};
        }

        return {type: 'already-published'}
    }

    async function buildWithManualVersioning(buildOptions: BuildOptions, latestVersion: Maybe<string>, versionToPublish: string): Promise<BuildResult> {

        if (latestVersion.isJust && latestVersion.value === versionToPublish) {
            throw new Error(`Version ${versionToPublish} of package ${buildOptions.name} is already published`);
        }

        const bundle = await bundler.build({...buildOptions, version: versionToPublish})
        const tarball = await artifactsBuilder.buildTarball(bundle)

        return {type: 'new-version', manifest: bundle.packageJson, tarData: tarball.tarData};
    }

    async function tryBuildAndPublish(options: BuildAndPublishOptions): Promise<BuildResult> {
        const {versioning = {automatic: true}, ...buildOptions} = options;

        const latestVersion = await registryClient.fetchLatestVersion(buildOptions.name);
        if (versioning.automatic) {
            return buildWithAutomaticVersioning(buildOptions, latestVersion, versioning.minimumVersion)
        }

        return buildWithManualVersioning(buildOptions, latestVersion, versioning.version)
    }

    return {
        tryBuildAndPublish,

        async buildAndPublish(options) {
            const result = await tryBuildAndPublish(options);

            if (result.type === 'new-version') {
                await registryClient.publishPackage(result.manifest, result.tarData);
            }
        }
    };
}
