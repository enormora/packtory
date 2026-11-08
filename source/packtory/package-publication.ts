import type { BundleEmitter } from '../bundle-emitter/emitter.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type * as inventory from '../software-bill-of-materials/software-bill-of-materials-file.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { PublicationOutcome } from '../bundle-emitter/publication-outcome.ts';
import type { PublishedReleaseArtifacts } from '../bundle-emitter/fetch-published-artifacts.ts';
import type { PublishedArtifactSmokeGate } from './published-artifact-smoke-gate.ts';
import type { BuildAndPublishOptions } from './map-configuration.ts';

export type PublishDependencies = {
    readonly bundleEmitter: BundleEmitter;
    readonly fileManager: {
        readonly checkReadability: (fileOrFolderPath: string) => Promise<{ readonly isReadable: boolean; }>;
        readonly readFile: (filePath: string) => Promise<string>;
    };
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly publishedArtifactSmokeGate: PublishedArtifactSmokeGate;
    readonly repositoryFolder: string;
    readonly softwareBillOfMaterialsFileBuilder: inventory.SoftwareBillOfMaterialsFileBuilder;
    readonly versionManager: VersionManager;
};

export type VersionedBundleWithManifest = Awaited<ReturnType<PublishDependencies['versionManager']['addVersion']>>;
export type CurrentVersion = Awaited<ReturnType<PublishDependencies['bundleEmitter']['determineCurrentVersion']>>;
type PublishedCheckResult = Awaited<
    ReturnType<PublishDependencies['bundleEmitter']['checkBundleAlreadyPublished']>
>;
export type CurrentHeadPublishedVersion = Awaited<
    ReturnType<PublishDependencies['bundleEmitter']['findCurrentHeadPublishedVersion']>
>;
export type PreviousReleaseArtifacts = Readonly<PublishedCheckResult['previousReleaseArtifacts']>;
export type ExtraFiles = Exclude<
    Awaited<ReturnType<PublishDependencies['softwareBillOfMaterialsFileBuilder']['generate']>>,
    undefined
>;
export type SiblingPackage = Parameters<
    PublishDependencies['softwareBillOfMaterialsFileBuilder']['generate']
>[1][number];
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

export const publishedReleaseStatus = {
    alreadyPublished: 'already-published',
    initialVersion: 'initial-version',
    newVersion: 'new-version'
} as const;

export type PublishedReleaseStatus = (typeof publishedReleaseStatus)[keyof typeof publishedReleaseStatus];

type BuildResultWithPublishedState = {
    readonly previousReleaseArtifacts: PublishedReleaseArtifactsMaybe;
    readonly status: PublishedReleaseStatus;
};

type NoPublishedReleaseArtifacts = { readonly isJust: false; };
type PublishedReleaseArtifactsValue = { readonly isJust: true; readonly value: PublishedReleaseArtifacts; };
type PublishedReleaseArtifactStates = readonly [
    NoPublishedReleaseArtifacts,
    PublishedReleaseArtifactsValue
];
type PublishedReleaseArtifactsMaybe = PublishedReleaseArtifactStates[number];

export function wasAlreadyPublished(buildResult: BuildResultWithPublishedState): boolean {
    return buildResult.status === publishedReleaseStatus.alreadyPublished;
}

export function publishedReleaseArtifactsOf(
    buildResult: BuildResultWithPublishedState
): PublishedReleaseArtifacts | undefined {
    return buildResult.previousReleaseArtifacts.isJust ? buildResult.previousReleaseArtifacts.value : undefined;
}
