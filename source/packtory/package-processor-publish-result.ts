import type { PublicationOutcome } from '../bundle-emitter/publication-outcome.ts';
import type { BuildAndPublishOptions } from './map-config.ts';
import type { PublishDependencies } from './package-processor-publish-dependencies.ts';
import type { PublishedReleaseStatus } from './published-release-state.ts';

export type VersionedBundleWithManifest = Awaited<ReturnType<PublishDependencies['versionManager']['addVersion']>>;
export type CurrentVersion = Awaited<ReturnType<PublishDependencies['bundleEmitter']['determineCurrentVersion']>>;
type PublishedCheckResult = Awaited<
    ReturnType<PublishDependencies['bundleEmitter']['checkBundleAlreadyPublished']>
>;
export type CurrentHeadPublishedVersion = Awaited<
    ReturnType<PublishDependencies['bundleEmitter']['findCurrentHeadPublishedVersion']>
>;
export type PreviousReleaseArtifacts = Readonly<PublishedCheckResult['previousReleaseArtifacts']>;
export type ExtraFiles = Exclude<Awaited<ReturnType<PublishDependencies['sbomFileBuilder']['generate']>>, undefined>;
export type SiblingPackage = Parameters<PublishDependencies['sbomFileBuilder']['generate']>[1][number];
export type AnalyzedBundle = Parameters<PublishDependencies['versionManager']['addVersion']>[0]['bundle'];

export type BuildAndPublishResult = {
    readonly status: PublishedReleaseStatus;
    readonly bundle: VersionedBundleWithManifest;
    readonly publication: PublicationOutcome;
    readonly extraFiles: ExtraFiles;
    readonly previousReleaseArtifacts: PreviousReleaseArtifacts;
};

export type DetermineVersionAndPublishOptions = {
    readonly analyzedBundle: AnalyzedBundle;
    readonly buildOptions: BuildAndPublishOptions;
    readonly stage: boolean;
    readonly substitutionPublicModuleSourcePaths?: ReadonlySet<string> | undefined;
};
