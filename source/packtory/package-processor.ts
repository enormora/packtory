import type { Maybe } from 'true-myth';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import { inspectLinkerRewrites, inspectScanResults } from '../report/inspectors.ts';
import type { BundleLinker } from '../linker/linker.ts';
import type { ResourceResolver } from '../resource-resolver/resource-resolver.ts';
import type { BundleEmitter } from '../bundle-emitter/emitter.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { AnalyzedBundle, DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { SbomFileBuilder } from '../sbom/sbom-file.ts';
import type { BuildAndPublishOptions, BuildOptions, ResolveAndLinkOptions } from './map-config.ts';

type LinkedBundle = Awaited<ReturnType<BundleLinker['linkBundle']>>;
type VersionedBundleWithManifest = Awaited<ReturnType<VersionManager['addVersion']>>;

export type BuildAndPublishResult = {
    readonly status: 'already-published' | 'initial-version' | 'new-version';
    readonly bundle: VersionedBundleWithManifest;
};

export type DetermineVersionAndPublishOptions = {
    readonly analyzedBundle: AnalyzedBundle;
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
    readonly sbomFileBuilder: SbomFileBuilder;
    readonly deadCodeEliminator: DeadCodeEliminator;
};

function assertEsmMainPackageJson(mainPackageJson: { readonly type?: string | undefined }): void {
    if (mainPackageJson.type !== 'module') {
        throw new Error('mainPackageJson.type must be "module"');
    }
}

function determineBuildVersion(currentVersion: Maybe<string>, options: BuildAndPublishOptions): string {
    if (currentVersion.isJust) {
        return currentVersion.value;
    }

    if (!options.versioning.automatic) {
        return options.versioning.version;
    }

    return options.versioning.minimumVersion ?? '0.0.0';
}

function maybeEmitScanCompleted(
    broadcaster: ProgressBroadcastProvider,
    packageName: string,
    resolved: Parameters<typeof inspectScanResults>[0]
): void {
    if (broadcaster.hasSubscribers('scanCompleted')) {
        broadcaster.emit('scanCompleted', { packageName, ...inspectScanResults(resolved) });
    }
}

function maybeEmitLinkingCompleted(
    broadcaster: ProgressBroadcastProvider,
    packageName: string,
    linked: LinkedBundle
): void {
    if (broadcaster.hasSubscribers('linkingCompleted')) {
        broadcaster.emit('linkingCompleted', { packageName, rewrites: inspectLinkerRewrites(linked) });
    }
}

function shouldIncreaseVersion(currentVersion: Maybe<string>, options: BuildAndPublishOptions): boolean {
    if (!options.versioning.automatic) {
        return false;
    }

    return currentVersion.isJust || options.versioning.minimumVersion === undefined;
}

function inferVersionTrigger(
    currentVersion: Maybe<string>,
    options: BuildAndPublishOptions,
    didBump: boolean
): 'auto-patch-bump' | 'initial' | 'minimum' | 'pinned' {
    if (didBump) {
        return 'auto-patch-bump';
    }
    if (!options.versioning.automatic) {
        return 'pinned';
    }
    if (currentVersion.isJust) {
        return 'auto-patch-bump';
    }
    if (options.versioning.minimumVersion !== undefined) {
        return 'minimum';
    }
    return 'initial';
}

export function createPackageProcessor(dependencies: PackageProcessorDependencies): PackageProcessor {
    const {
        progressBroadcaster,
        versionManager,
        bundleEmitter,
        linker,
        resourceResolver,
        sbomFileBuilder,
        deadCodeEliminator
    } = dependencies;

    async function analyzeOne(linkedBundle: LinkedBundle, transformationsEnabled: boolean): Promise<AnalyzedBundle> {
        const [analyzedBundle] = await deadCodeEliminator.eliminate([{ bundle: linkedBundle, transformationsEnabled }]);
        if (analyzedBundle === undefined) {
            throw new Error(`Dead code eliminator returned no bundle for "${linkedBundle.name}"`);
        }
        return analyzedBundle;
    }

    async function resolveAndLink(options: ResolveAndLinkOptions): Promise<LinkedBundle> {
        assertEsmMainPackageJson(options.mainPackageJson);
        progressBroadcaster.emit('resolving', { packageName: options.name });
        const resolvedBundle = await resourceResolver.resolve(options);
        maybeEmitScanCompleted(progressBroadcaster, options.name, resolvedBundle);
        progressBroadcaster.emit('linking', { packageName: options.name });
        const linkedBundle = await linker.linkBundle({
            bundle: resolvedBundle,
            bundleDependencies: [...options.bundleDependencies, ...options.bundlePeerDependencies]
        });
        maybeEmitLinkingCompleted(progressBroadcaster, options.name, linkedBundle);
        return linkedBundle;
    }

    async function buildVersionedBundle(
        analyzedBundle: AnalyzedBundle,
        options: BuildAndPublishOptions
    ): Promise<{
        versionedBundle: VersionedBundleWithManifest;
        currentVersion: Maybe<string>;
        version: string;
    }> {
        const currentVersion = await bundleEmitter.determineCurrentVersion({
            name: analyzedBundle.name,
            registrySettings: options.registrySettings,
            versioning: options.versioning
        });
        const version = determineBuildVersion(currentVersion, options);
        progressBroadcaster.emit('building', { packageName: options.name, version });
        const versionedBundle = versionManager.addVersion({ bundle: analyzedBundle, ...options, version });
        return { versionedBundle, currentVersion, version };
    }

    function siblingsFromOptions(buildOptions: BuildAndPublishOptions): readonly VersionedBundleWithManifest[] {
        return [...buildOptions.bundleDependencies, ...buildOptions.bundlePeerDependencies];
    }

    function emitVersionDetermined(args: {
        readonly options: BuildAndPublishOptions;
        readonly currentVersion: Maybe<string>;
        readonly chosenVersion: string;
        readonly didBump: boolean;
    }): void {
        if (!progressBroadcaster.hasSubscribers('versionDetermined')) {
            return;
        }
        progressBroadcaster.emit('versionDetermined', {
            packageName: args.options.name,
            previousVersion: args.currentVersion.isJust ? args.currentVersion.value : undefined,
            chosenVersion: args.chosenVersion,
            trigger: inferVersionTrigger(args.currentVersion, args.options, args.didBump)
        });
    }

    function finalizeWithoutBump(
        buildContext: { versionedBundle: VersionedBundleWithManifest; currentVersion: Maybe<string> },
        options: BuildAndPublishOptions,
        status: BuildAndPublishResult['status']
    ): BuildAndPublishResult {
        emitVersionDetermined({
            options,
            currentVersion: buildContext.currentVersion,
            chosenVersion: buildContext.versionedBundle.version,
            didBump: false
        });
        return { bundle: buildContext.versionedBundle, status };
    }

    async function bumpVersion(
        buildContext: { versionedBundle: VersionedBundleWithManifest; version: string; currentVersion: Maybe<string> },
        options: BuildAndPublishOptions
    ): Promise<VersionedBundleWithManifest> {
        progressBroadcaster.emit('rebuilding', { packageName: options.name, version: buildContext.version });
        const newVersionedBundle = versionManager.increaseVersion(buildContext.versionedBundle);
        emitVersionDetermined({
            options,
            currentVersion: buildContext.currentVersion,
            chosenVersion: newVersionedBundle.version,
            didBump: true
        });
        return newVersionedBundle;
    }

    async function tryBuildAndPublish(options: DetermineVersionAndPublishOptions): Promise<BuildAndPublishResult> {
        const buildContext = await buildVersionedBundle(options.analyzedBundle, options.buildOptions);
        const extraFiles = await sbomFileBuilder.generate(
            buildContext.versionedBundle,
            siblingsFromOptions(options.buildOptions),
            options.buildOptions.publishSettings
        );
        const result = await bundleEmitter.checkBundleAlreadyPublished({
            bundle: buildContext.versionedBundle,
            registrySettings: options.buildOptions.registrySettings,
            ...(extraFiles === undefined ? {} : { extraFiles })
        });
        if (result.alreadyPublishedAsLatest) {
            return finalizeWithoutBump(buildContext, options.buildOptions, 'already-published');
        }
        if (!shouldIncreaseVersion(buildContext.currentVersion, options.buildOptions)) {
            return finalizeWithoutBump(
                buildContext,
                options.buildOptions,
                buildContext.currentVersion.isJust ? 'new-version' : 'initial-version'
            );
        }
        const newVersionedBundle = await bumpVersion(buildContext, options.buildOptions);
        return {
            bundle: newVersionedBundle,
            status: buildContext.currentVersion.isJust ? 'new-version' : 'initial-version'
        };
    }

    return {
        resolveAndLink,
        async build(options) {
            assertEsmMainPackageJson(options.mainPackageJson);
            const {
                bundleDependencies,
                bundlePeerDependencies,
                entryPoints,
                includeSourceMapFiles,
                additionalFiles,
                name,
                sourcesFolder
            } = options;
            const linkedBundle = await resolveAndLink({
                name,
                sourcesFolder,
                entryPoints,
                includeSourceMapFiles,
                additionalFiles,
                mainPackageJson: options.mainPackageJson,
                additionalPackageJsonAttributes: options.additionalPackageJsonAttributes,
                allowMutableSpecifiers: options.allowMutableSpecifiers,
                bundleDependencies,
                bundlePeerDependencies
            });

            const transformationsEnabled = options.deadCodeElimination?.enabled ?? true;
            const analyzedBundle = await analyzeOne(linkedBundle, transformationsEnabled);
            return versionManager.addVersion({
                bundle: analyzedBundle,
                version: options.version,
                mainPackageJson: options.mainPackageJson,
                bundleDependencies: options.bundleDependencies,
                bundlePeerDependencies: options.bundlePeerDependencies,
                additionalPackageJsonAttributes: options.additionalPackageJsonAttributes,
                allowMutableSpecifiers: options.allowMutableSpecifiers
            });
        },

        tryBuildAndPublish,

        async buildAndPublish(options) {
            assertEsmMainPackageJson(options.buildOptions.mainPackageJson);
            const result = await tryBuildAndPublish(options);
            if (result.status === 'already-published') {
                return result;
            }

            progressBroadcaster.emit('publishing', {
                packageName: options.buildOptions.name,
                version: result.bundle.version
            });
            const extraFiles = await sbomFileBuilder.generate(
                result.bundle,
                siblingsFromOptions(options.buildOptions),
                options.buildOptions.publishSettings
            );
            await bundleEmitter.publish({
                bundle: result.bundle,
                registrySettings: options.buildOptions.registrySettings,
                publishSettings: options.buildOptions.publishSettings,
                ...(extraFiles === undefined ? {} : { extraFiles })
            });

            return result;
        }
    };
}
