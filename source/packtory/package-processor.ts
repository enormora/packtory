import type { Except } from 'type-fest';
import type { Maybe } from 'true-myth';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.js';
import type { BundleLinker } from '../linker/linker.js';
import type { ResourceResolver } from '../resource-resolver/resource-resolver.js';
import type { BundleEmitter } from '../bundle-emitter/emitter.js';
import type { VersionManager } from '../version-manager/manager.js';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.js';
import type { LinkedBundle } from '../linker/linked-bundle.js';
import type { BuildAndPublishOptions, BuildOptions } from './map-config.js';

export type BuildAndPublishResult = {
    readonly status: 'already-published' | 'initial-version' | 'new-version';
    readonly bundle: VersionedBundleWithManifest;
};

export type PackageProcessor = {
    build: (options: BuildOptions) => Promise<VersionedBundleWithManifest>;
    buildAndPublish: (options: BuildAndPublishOptions) => Promise<BuildAndPublishResult>;
    tryBuildAndPublish: (options: BuildAndPublishOptions) => Promise<BuildAndPublishResult>;
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

    async function resolveAndLinkBundle(options: Except<BuildOptions, 'version'>): Promise<LinkedBundle> {
        progressBroadcaster.emit('resolving', { packageName: options.name });
        const resolvedBundle = await resourceResolver.resolve(options);
        progressBroadcaster.emit('linking', { packageName: options.name });
        const linkedBundle = await linker.linkBundle({
            bundle: resolvedBundle,
            bundleDependencies: [...options.bundleDependencies, ...options.bundlePeerDependencies]
        });
        return linkedBundle;
    }

    async function buildVersionedBundle(options: BuildAndPublishOptions): Promise<{
        versionedBundle: VersionedBundleWithManifest;
        currentVersion: Maybe<string>;
        version: string;
    }> {
        const linkedBundle = await resolveAndLinkBundle(options);
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

    async function tryBuildAndPublish(options: BuildAndPublishOptions): Promise<BuildAndPublishResult> {
        const buildContext = await buildVersionedBundle(options);
        const result = await bundleEmitter.checkBundleAlreadyPublished({
            bundle: buildContext.versionedBundle,
            registrySettings: options.registrySettings
        });
        if (result.alreadyPublishedAsLatest) {
            return { bundle: buildContext.versionedBundle, status: 'already-published' };
        }
        progressBroadcaster.emit('rebuilding', { packageName: options.name, version: buildContext.version });
        const newVersionedBundle = versionManager.increaseVersion(buildContext.versionedBundle);
        return {
            bundle: newVersionedBundle,
            status: buildContext.currentVersion.isJust ? 'new-version' : 'initial-version'
        };
    }

    return {
        async build(options) {
            const linkedBundle = await resolveAndLinkBundle(options);

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

            progressBroadcaster.emit('publishing', { packageName: options.name, version: result.bundle.version });
            await bundleEmitter.publish({ bundle: result.bundle, registrySettings: options.registrySettings });

            return result;
        }
    };
}
