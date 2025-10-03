import type { Maybe } from 'true-myth';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { BundleLinker } from '../linker/linker.ts';
import type { ResourceResolver } from '../resource-resolver/resource-resolver.ts';
import type { BundleEmitter } from '../bundle-emitter/emitter.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { BuildAndPublishOptions, BuildOptions, ResolveAndLinkOptions } from './map-config.ts';

export type BuildAndPublishResult = {
    readonly status: 'already-published' | 'initial-version' | 'new-version';
    readonly bundle: VersionedBundleWithManifest;
};

export type DetermineVersionAndPublishOptions = {
    readonly linkedBundle: LinkedBundle;
    readonly buildOptions: BuildAndPublishOptions;
};

export type PackageProcessor = {
    resolveAndLink: (options: ResolveAndLinkOptions) => Promise<LinkedBundle>;
    build: (options: BuildOptions) => Promise<VersionedBundleWithManifest>;
    buildAndPublish: (options: DetermineVersionAndPublishOptions) => Promise<BuildAndPublishResult>;
    tryBuildAndPublish: (options: DetermineVersionAndPublishOptions) => Promise<BuildAndPublishResult>;
};

type PackageProcessorDependencies = {
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly versionManager: VersionManager;
    readonly bundleEmitter: BundleEmitter;
    readonly linker: BundleLinker;
    readonly resourceResolver: ResourceResolver;
};

export function createPackageProcessor(dependencies: PackageProcessorDependencies): PackageProcessor {
    const { progressBroadcaster, versionManager, bundleEmitter, linker, resourceResolver } = dependencies;

    async function resolveAndLink(options: ResolveAndLinkOptions): Promise<LinkedBundle> {
        progressBroadcaster.emit('resolving', { packageName: options.name });
        const resolvedBundle = await resourceResolver.resolve(options);
        progressBroadcaster.emit('linking', { packageName: options.name });
        const linkedBundle = await linker.linkBundle({
            bundle: resolvedBundle,
            bundleDependencies: [...options.bundleDependencies, ...options.bundlePeerDependencies]
        });
        return linkedBundle;
    }

    async function buildVersionedBundle(
        linkedBundle: LinkedBundle,
        options: BuildAndPublishOptions
    ): Promise<{
        versionedBundle: VersionedBundleWithManifest;
        currentVersion: Maybe<string>;
        version: string;
    }> {
        const currentVersion = await bundleEmitter.determineCurrentVersion({
            name: linkedBundle.name,
            registrySettings: options.registrySettings,
            versioning: options.versioning
        });
        const version = currentVersion.unwrapOr('0.0.0');
        progressBroadcaster.emit('building', { packageName: options.name, version });
        const versionedBundle = versionManager.addVersion({ bundle: linkedBundle, ...options, version });
        return { versionedBundle, currentVersion, version };
    }

    async function tryBuildAndPublish(options: DetermineVersionAndPublishOptions): Promise<BuildAndPublishResult> {
        const buildContext = await buildVersionedBundle(options.linkedBundle, options.buildOptions);
        const result = await bundleEmitter.checkBundleAlreadyPublished({
            bundle: buildContext.versionedBundle,
            registrySettings: options.buildOptions.registrySettings
        });
        if (result.alreadyPublishedAsLatest) {
            return { bundle: buildContext.versionedBundle, status: 'already-published' };
        }
        progressBroadcaster.emit('rebuilding', {
            packageName: options.buildOptions.name,
            version: buildContext.version
        });
        const newVersionedBundle = versionManager.increaseVersion(buildContext.versionedBundle);
        return {
            bundle: newVersionedBundle,
            status: buildContext.currentVersion.isJust ? 'new-version' : 'initial-version'
        };
    }

    return {
        resolveAndLink,
        async build(options) {
            const {
                bundleDependencies,
                bundlePeerDependencies,
                entryPoints,
                includeSourceMapFiles,
                additionalFiles,
                moduleResolution,
                name,
                sourcesFolder
            } = options;
            const linkedBundle = await resolveAndLink({
                name,
                sourcesFolder,
                entryPoints,
                includeSourceMapFiles,
                additionalFiles,
                moduleResolution,
                mainPackageJson: options.mainPackageJson,
                additionalPackageJsonAttributes: options.additionalPackageJsonAttributes,
                bundleDependencies,
                bundlePeerDependencies
            });

            return versionManager.addVersion({
                bundle: linkedBundle,
                version: options.version,
                mainPackageJson: options.mainPackageJson,
                bundleDependencies: options.bundleDependencies,
                bundlePeerDependencies: options.bundlePeerDependencies,
                additionalPackageJsonAttributes: options.additionalPackageJsonAttributes
            });
        },

        tryBuildAndPublish,

        async buildAndPublish(options) {
            const result = await tryBuildAndPublish(options);
            if (result.status === 'already-published') {
                return result;
            }

            progressBroadcaster.emit('publishing', {
                packageName: options.buildOptions.name,
                version: result.bundle.version
            });
            await bundleEmitter.publish({
                bundle: result.bundle,
                registrySettings: options.buildOptions.registrySettings
            });

            return result;
        }
    };
}
