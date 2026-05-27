/* eslint-disable import/max-dependencies -- the publish operation legitimately bridges bundle-emitter, version-manager, sbom, progress, and option-mapping helpers */
import { isDefined, pickBy } from 'remeda';
import type { Maybe } from 'true-myth';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { bundledDependenciesFrom } from '../common/bundled-dependency-groups.ts';
import type { BundleEmitter } from '../bundle-emitter/emitter.ts';
import type { PublishedReleaseArtifacts } from '../bundle-emitter/fetch-published-artifacts.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { SbomSiblingPackage } from '../published-package/published-package.ts';
import type { SbomFileBuilder } from '../sbom/sbom-file.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { BuildAndPublishOptions } from './map-config.ts';
import { determineBuildVersion, inferVersionTrigger, shouldIncreaseVersion } from './options/version-trigger.ts';
import { publishedReleaseStatus, type PublishedReleaseStatus, wasAlreadyPublished } from './published-release-state.ts';

type VersionedBundleWithManifest = Awaited<ReturnType<VersionManager['addVersion']>>;
type PublishDependencies = {
    readonly bundleEmitter: BundleEmitter;
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly sbomFileBuilder: SbomFileBuilder;
    readonly versionManager: VersionManager;
};

export type BuildAndPublishResult = {
    readonly status: PublishedReleaseStatus;
    readonly bundle: VersionedBundleWithManifest;
    readonly extraFiles: readonly FileDescription[];
    readonly previousReleaseArtifacts: Maybe<PublishedReleaseArtifacts>;
};

export type DetermineVersionAndPublishOptions = {
    readonly analyzedBundle: AnalyzedBundle;
    readonly buildOptions: BuildAndPublishOptions;
    readonly substitutionPublicModuleSourcePaths?: ReadonlySet<string> | undefined;
};

function assertEsmMainPackageJson(mainPackageJson: { readonly type?: string | undefined }): void {
    if (mainPackageJson.type !== 'module') {
        throw new Error('mainPackageJson.type must be "module"');
    }
}

const siblingsFromOptions = bundledDependenciesFrom<SbomSiblingPackage>;

export type PublishOperations = {
    readonly buildAndPublish: (options: DetermineVersionAndPublishOptions) => Promise<BuildAndPublishResult>;
    readonly tryBuildAndPublish: (options: DetermineVersionAndPublishOptions) => Promise<BuildAndPublishResult>;
};

export function createPublishOperations(dependencies: PublishDependencies): PublishOperations {
    async function buildVersionedBundle(
        analyzedBundle: AnalyzedBundle,
        options: BuildAndPublishOptions,
        substitutionPublicModuleSourcePaths: ReadonlySet<string> | undefined
    ): Promise<{
        versionedBundle: VersionedBundleWithManifest;
        currentVersion: Maybe<string>;
        version: string;
    }> {
        assertEsmMainPackageJson(options.mainPackageJson);
        const currentVersion = await dependencies.bundleEmitter.determineCurrentVersion({
            name: analyzedBundle.name,
            registrySettings: options.registrySettings,
            versioning: options.versioning
        });
        const version = determineBuildVersion(currentVersion, options);
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
        readonly currentVersion: Maybe<string>;
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
        buildContext: { versionedBundle: VersionedBundleWithManifest; currentVersion: Maybe<string> },
        options: BuildAndPublishOptions,
        status: BuildAndPublishResult['status'],
        extras: {
            extraFiles: readonly FileDescription[];
            previousReleaseArtifacts: Maybe<PublishedReleaseArtifacts>;
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
            extraFiles: extras.extraFiles,
            previousReleaseArtifacts: extras.previousReleaseArtifacts
        };
    }

    async function bumpVersion(
        buildContext: { versionedBundle: VersionedBundleWithManifest; version: string; currentVersion: Maybe<string> },
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
    ): Promise<readonly FileDescription[]> {
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
        await dependencies.bundleEmitter.publish(
            pickBy(
                {
                    bundle: result.bundle,
                    registrySettings: options.buildOptions.registrySettings,
                    publishSettings: options.buildOptions.publishSettings,
                    extraFiles: result.extraFiles.length === 0 ? undefined : result.extraFiles
                },
                isDefined
            )
        );

        return result;
    }

    return { buildAndPublish, tryBuildAndPublish };
}
