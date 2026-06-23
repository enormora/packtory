import { isDefined, pickBy } from 'remeda';
import { noPublication } from '../bundle-emitter/publication-outcome.ts';
import type { BundleEmitter } from '../bundle-emitter/emitter.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { SbomFileBuilder } from '../sbom/sbom-file.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { BuildAndPublishOptions } from './map-config.ts';
import { createVersionProviderContext } from './options/version-provider-context.ts';
import { determineBuildVersion, inferVersionTrigger, shouldIncreaseVersion } from './options/version-trigger.ts';
import { publishedReleaseStatus, type PublishedReleaseStatus, wasAlreadyPublished } from './published-release-state.ts';

type PublishDependencies = {
    readonly bundleEmitter: BundleEmitter;
    readonly fileManager: {
        readonly checkReadability: (fileOrFolderPath: string) => Promise<{ readonly isReadable: boolean }>;
        readonly readFile: (filePath: string) => Promise<string>;
    };
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly repositoryFolder: string;
    readonly sbomFileBuilder: SbomFileBuilder;
    readonly versionManager: VersionManager;
};

type VersionedBundleWithManifest = Awaited<ReturnType<PublishDependencies['versionManager']['addVersion']>>;
type CurrentVersion = Awaited<ReturnType<PublishDependencies['bundleEmitter']['determineCurrentVersion']>>;
type PublicationOutcome = Awaited<ReturnType<PublishDependencies['bundleEmitter']['publish']>>;
type PreviousReleaseArtifacts = Awaited<
    ReturnType<PublishDependencies['bundleEmitter']['checkBundleAlreadyPublished']>
>['previousReleaseArtifacts'];
type ExtraFiles = Exclude<Awaited<ReturnType<PublishDependencies['sbomFileBuilder']['generate']>>, undefined>;
type SiblingPackage = Parameters<PublishDependencies['sbomFileBuilder']['generate']>[1][number];
type AnalyzedBundle = Parameters<typeof createVersionProviderContext>[1];

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

function assertEsmMainPackageJson(mainPackageJson: { readonly type?: string | undefined }): void {
    if (mainPackageJson.type !== 'module') {
        throw new Error('mainPackageJson.type must be "module"');
    }
}

function siblingsFromOptions(buildOptions: BuildAndPublishOptions): readonly SiblingPackage[] {
    return [...buildOptions.bundleDependencies, ...buildOptions.bundlePeerDependencies];
}

export type PublishOperations = {
    readonly buildAndPublish: (options: DetermineVersionAndPublishOptions) => Promise<BuildAndPublishResult>;
    readonly tryBuildAndPublish: (options: DetermineVersionAndPublishOptions) => Promise<BuildAndPublishResult>;
};

export function createPublishOperations(dependencies: PublishDependencies): PublishOperations {
    async function buildVersionedBundle(
        analyzedBundle: AnalyzedBundle,
        options: BuildAndPublishOptions,
        stage: boolean,
        substitutionPublicModuleSourcePaths: ReadonlySet<string> | undefined
    ): Promise<{
        versionedBundle: VersionedBundleWithManifest;
        currentVersion: CurrentVersion;
        version: string;
    }> {
        assertEsmMainPackageJson(options.mainPackageJson);
        const currentVersion = await dependencies.bundleEmitter.determineCurrentVersion({
            name: analyzedBundle.name,
            registrySettings: options.registrySettings,
            stage,
            versioning: options.versioning
        });
        const version = await determineBuildVersion(
            currentVersion,
            options,
            await createVersionProviderContext(dependencies, analyzedBundle, options, stage)
        );
        dependencies.progressBroadcaster.emit('building', { packageName: options.name, version });
        const versionedBundle = dependencies.versionManager.addVersion({
            bundle: analyzedBundle,
            ...options,
            version,
            substitutionPublicModuleSourcePaths
        });
        return { versionedBundle, currentVersion, version };
    }

    function emitVersionDetermined(args: {
        readonly options: BuildAndPublishOptions;
        readonly currentVersion: CurrentVersion;
        readonly chosenVersion: string;
        readonly didBump: boolean;
    }): void {
        if (!dependencies.progressBroadcaster.hasSubscribers('versionDetermined')) {
            return;
        }
        dependencies.progressBroadcaster.emit('versionDetermined', {
            packageName: args.options.name,
            previousVersion: args.currentVersion.isJust ? args.currentVersion.value : undefined,
            chosenVersion: args.chosenVersion,
            trigger: inferVersionTrigger(args.currentVersion, args.options, args.didBump)
        });
    }

    function finalizeWithoutBump(
        buildContext: { versionedBundle: VersionedBundleWithManifest; currentVersion: CurrentVersion },
        options: BuildAndPublishOptions,
        status: BuildAndPublishResult['status'],
        extras: {
            extraFiles: ExtraFiles;
            previousReleaseArtifacts: PreviousReleaseArtifacts;
        }
    ): BuildAndPublishResult {
        emitVersionDetermined({
            options,
            currentVersion: buildContext.currentVersion,
            chosenVersion: buildContext.versionedBundle.version,
            didBump: false
        });
        return {
            bundle: buildContext.versionedBundle,
            status,
            publication: noPublication,
            extraFiles: extras.extraFiles,
            previousReleaseArtifacts: extras.previousReleaseArtifacts
        };
    }

    async function bumpVersion(
        buildContext: {
            readonly versionedBundle: VersionedBundleWithManifest;
            readonly version: string;
            readonly currentVersion: CurrentVersion;
        },
        options: BuildAndPublishOptions
    ): Promise<VersionedBundleWithManifest> {
        dependencies.progressBroadcaster.emit('rebuilding', {
            packageName: options.name,
            version: buildContext.version
        });
        const newVersionedBundle = dependencies.versionManager.increaseVersion(buildContext.versionedBundle);
        emitVersionDetermined({
            options,
            currentVersion: buildContext.currentVersion,
            chosenVersion: newVersionedBundle.version,
            didBump: true
        });
        return newVersionedBundle;
    }

    async function generateExtraFiles(
        versionedBundle: VersionedBundleWithManifest,
        buildOptions: BuildAndPublishOptions
    ): Promise<ExtraFiles> {
        const result = await dependencies.sbomFileBuilder.generate(
            versionedBundle,
            siblingsFromOptions(buildOptions),
            buildOptions.publishSettings
        );
        return result ?? [];
    }

    async function tryBuildAndPublish(options: DetermineVersionAndPublishOptions): Promise<BuildAndPublishResult> {
        const buildContext = await buildVersionedBundle(
            options.analyzedBundle,
            options.buildOptions,
            options.stage,
            options.substitutionPublicModuleSourcePaths
        );
        const preBumpExtraFiles = await generateExtraFiles(buildContext.versionedBundle, options.buildOptions);
        const alreadyPublished = await dependencies.bundleEmitter.checkBundleAlreadyPublished(
            pickBy(
                {
                    bundle: buildContext.versionedBundle,
                    registrySettings: options.buildOptions.registrySettings,
                    extraFiles: preBumpExtraFiles.length === 0 ? undefined : preBumpExtraFiles
                },
                isDefined
            )
        );

        if (alreadyPublished.alreadyPublishedAsLatest) {
            return finalizeWithoutBump(buildContext, options.buildOptions, publishedReleaseStatus.alreadyPublished, {
                extraFiles: preBumpExtraFiles,
                previousReleaseArtifacts: alreadyPublished.previousReleaseArtifacts
            });
        }
        if (!shouldIncreaseVersion(buildContext.currentVersion, options.buildOptions)) {
            return finalizeWithoutBump(
                buildContext,
                options.buildOptions,
                buildContext.currentVersion.isJust
                    ? publishedReleaseStatus.newVersion
                    : publishedReleaseStatus.initialVersion,
                {
                    extraFiles: preBumpExtraFiles,
                    previousReleaseArtifacts: alreadyPublished.previousReleaseArtifacts
                }
            );
        }
        const newVersionedBundle = await bumpVersion(buildContext, options.buildOptions);
        const extraFiles = await generateExtraFiles(newVersionedBundle, options.buildOptions);
        return {
            bundle: newVersionedBundle,
            status: buildContext.currentVersion.isJust
                ? publishedReleaseStatus.newVersion
                : publishedReleaseStatus.initialVersion,
            publication: noPublication,
            extraFiles,
            previousReleaseArtifacts: alreadyPublished.previousReleaseArtifacts
        };
    }

    async function buildAndPublish(options: DetermineVersionAndPublishOptions): Promise<BuildAndPublishResult> {
        const result = await tryBuildAndPublish(options);
        if (wasAlreadyPublished(result)) {
            return result;
        }

        dependencies.progressBroadcaster.emit('publishing', {
            packageName: options.buildOptions.name,
            version: result.bundle.version
        });
        const publication = await dependencies.bundleEmitter.publish(
            pickBy(
                {
                    bundle: result.bundle,
                    registrySettings: options.buildOptions.registrySettings,
                    publishSettings: options.buildOptions.publishSettings,
                    stage: options.stage,
                    extraFiles: result.extraFiles.length === 0 ? undefined : result.extraFiles
                },
                isDefined
            )
        );

        return { ...result, publication };
    }

    return { buildAndPublish, tryBuildAndPublish };
}
