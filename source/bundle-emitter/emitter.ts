import semver from 'semver';
import { Maybe } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { compareFileDescriptions, fileDescriptionComparisonStatus } from '../file-manager/compare.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { ArtifactPublishPackage } from '../published-package/published-package.ts';
import { fetchPublishedArtifacts } from './fetch-published-artifacts.ts';
import { canonicalizeReleaseArtifactFiles } from './release-artifact-canonicalizer.ts';
import type { RegistryClient } from './registry/registry-client.ts';
import { assertRepositoryCoherence } from './repository-coherence.ts';

type Second<TValues extends readonly unknown[]> = TValues extends readonly [
    unknown,
    infer TValue,
    ...(readonly unknown[])
] ? TValue
    : never;
type Fourth<TValues extends readonly unknown[]> = TValues extends readonly [
    unknown,
    unknown,
    unknown,
    infer TValue,
    ...(readonly unknown[])
] ? TValue
    : never;
type RegistryClientPublishArguments = Parameters<RegistryClient['publishPackage']>;
type ExtraFiles = readonly FileDescription[];
type PublicationOutcome = Awaited<ReturnType<RegistryClient['publishPackage']>>;
type PublishSettings = Fourth<RegistryClientPublishArguments>;
type RegistrySettings = Second<Parameters<RegistryClient['fetchLatestVersion']>>;
type ProvidedVersioningSettings = { readonly automatic: false; readonly provideVersion: unknown; };
type FixedVersioningSettings = { readonly automatic: false; readonly version: string; };
type AutomaticVersioningSettings = { readonly automatic: true; };
type VersioningSettings = AutomaticVersioningSettings | FixedVersioningSettings | ProvidedVersioningSettings;
type PreviousReleaseArtifacts = Awaited<ReturnType<typeof fetchPublishedArtifacts>>;

export type BundleEmitterDependencies = {
    readonly artifactsBuilder: ArtifactsBuilder;
    readonly registryClient: RegistryClient;
    readonly ciRepositoryUrl: string | undefined;
    readonly readCurrentGitHead: () => Promise<string | undefined>;
};

type PublishOptions = {
    readonly bundle: ArtifactPublishPackage;
    readonly registrySettings: RegistrySettings;
    readonly publishSettings: PublishSettings;
    readonly stage: boolean;
    readonly extraFiles?: ExtraFiles;
};

type AlreadyPublishedCheckOptions = {
    readonly bundle: ArtifactPublishPackage;
    readonly registrySettings: RegistrySettings;
    readonly extraFiles?: ExtraFiles;
};

type CurrentVersionLookupOptions = {
    readonly name: string;
    readonly registrySettings: RegistrySettings;
    readonly stage: boolean;
    readonly versioning: VersioningSettings;
};

type CurrentHeadPublishedVersionLookupOptions = {
    readonly name: string;
    readonly registrySettings: RegistrySettings;
};

type CurrentHeadPublishedVersion = {
    readonly version: string;
    readonly gitHead: string;
};
type PackageVersionGitHead = {
    readonly gitHead: string | undefined;
};
type PackageVersionWithGitHead = {
    readonly gitHead: string;
};

type BundlePublishedCheckResult = {
    readonly alreadyPublishedAsLatest: boolean;
    readonly previousReleaseArtifacts: PreviousReleaseArtifacts;
};

export type BundleEmitter = {
    publish: (options: PublishOptions) => Promise<PublicationOutcome>;
    determineCurrentVersion: (options: CurrentVersionLookupOptions) => Promise<Maybe<string>>;
    findCurrentHeadPublishedVersion: (
        options: CurrentHeadPublishedVersionLookupOptions
    ) => Promise<CurrentHeadPublishedVersion | undefined>;
    checkBundleAlreadyPublished: (options: AlreadyPublishedCheckOptions) => Promise<BundlePublishedCheckResult>;
};

const stageRegistryUnsupportedMessage = 'npm staged publishing is only supported with the npmjs.org registry';
const stageFirstPublishUnsupportedMessage =
    'npm staged publishing requires the package to already exist on the npm registry';
const npmRegistryUrl = 'https://registry.npmjs.org/';

function isNpmRegistry(registryUrl: string | undefined): boolean {
    const resolvedRegistryUrl = new URL(registryUrl ?? npmRegistryUrl);
    return resolvedRegistryUrl.href === npmRegistryUrl;
}

function validateVersion(version: string): string {
    const normalized = semver.valid(version);
    if (normalized === null) {
        throw new Error(`Registry returned an invalid version "${version}" for staged publishing`);
    }
    return normalized;
}

function highestVersion(firstVersion: string, laterVersions: readonly string[]): string {
    let highest = validateVersion(firstVersion);

    for (const version of laterVersions) {
        const candidate = validateVersion(version);
        if (semver.gt(candidate, highest)) {
            highest = candidate;
        }
    }

    return highest;
}

function hasVersionProvider(
    versioning: VersioningSettings
): versioning is Extract<VersioningSettings, { readonly provideVersion: unknown; }> {
    return Object.hasOwn(versioning, 'provideVersion');
}

function isCurrentHeadPackageVersion(
    versionDetails: PackageVersionGitHead,
    currentGitHead: string
): versionDetails is PackageVersionWithGitHead {
    return versionDetails.gitHead === currentGitHead;
}

export function createBundleEmitter(dependencies: BundleEmitterDependencies): BundleEmitter {
    const { artifactsBuilder, registryClient, ciRepositoryUrl, readCurrentGitHead } = dependencies;

    async function determineCurrentVersionForStageMode(
        name: string,
        registrySettings: RegistrySettings,
        versioning: VersioningSettings
    ): Promise<Maybe<string>> {
        if (!isNpmRegistry(registrySettings.registryUrl)) {
            throw new Error(stageRegistryUnsupportedMessage);
        }

        const latestVersion = await registryClient.fetchLatestVersion(name, registrySettings);
        if (latestVersion.isNothing) {
            throw new Error(stageFirstPublishUnsupportedMessage);
        }

        if (!versioning.automatic && !hasVersionProvider(versioning)) {
            return Maybe.just(versioning.version);
        }

        const stagedVersions = await registryClient.fetchStagedVersions(name, registrySettings);
        return Maybe.just(highestVersion(latestVersion.value.version, stagedVersions));
    }

    return {
        async determineCurrentVersion(options) {
            const { versioning, registrySettings, name, stage } = options;

            if (stage) {
                return determineCurrentVersionForStageMode(name, registrySettings, versioning);
            }

            if (versioning.automatic || hasVersionProvider(versioning)) {
                const latestVersion = await registryClient.fetchLatestVersion(name, registrySettings);
                return latestVersion.map(function (version) {
                    return version.version;
                });
            }

            return Maybe.just(versioning.version);
        },

        async findCurrentHeadPublishedVersion(options) {
            const currentGitHead = await readCurrentGitHead();
            if (currentGitHead === undefined) {
                return undefined;
            }
            const latestVersion = await registryClient.fetchLatestVersion(options.name, options.registrySettings);
            if (latestVersion.isNothing || !isCurrentHeadPackageVersion(latestVersion.value, currentGitHead)) {
                return undefined;
            }
            return {
                version: latestVersion.value.version,
                gitHead: latestVersion.value.gitHead
            };
        },

        async checkBundleAlreadyPublished(options) {
            const { bundle, registrySettings, extraFiles } = options;
            const previous = await fetchPublishedArtifacts(registryClient, bundle.name, registrySettings);
            if (previous.isNothing) {
                return { alreadyPublishedAsLatest: false, previousReleaseArtifacts: Maybe.nothing() };
            }

            const artifactContents = artifactsBuilder.collectContents(bundle, 'package', extraFiles);
            const comparison = compareFileDescriptions(
                canonicalizeReleaseArtifactFiles(artifactContents),
                canonicalizeReleaseArtifactFiles(previous.value.files)
            );
            return {
                alreadyPublishedAsLatest: comparison.status === fileDescriptionComparisonStatus.equal,
                previousReleaseArtifacts: previous
            };
        },

        async publish(options) {
            if (options.publishSettings.access === 'public' && options.publishSettings.provenance?.type === 'auto') {
                assertRepositoryCoherence(options.bundle.packageJson, ciRepositoryUrl);
            }

            const tarball = await artifactsBuilder.buildTarball(options.bundle, options.extraFiles);
            const currentGitHead = await readCurrentGitHead();
            const publishManifest = currentGitHead === undefined
                ? options.bundle.packageJson
                : { ...options.bundle.packageJson, gitHead: currentGitHead };

            return registryClient.publishPackage(
                publishManifest,
                tarball.tarData,
                options.registrySettings,
                options.publishSettings,
                options.stage
            );
        }
    };
}
