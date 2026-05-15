import type { AnalyzedBundle, DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { BundleLinker } from '../linker/linker.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import { resolveRootsAndSurface } from '../resource-resolver/resource-resolve-options.ts';
import type { ResourceResolver } from '../resource-resolver/resource-resolver.ts';
import { inspectLinkerRewrites, inspectScanResults } from '../report/inspectors.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { BuildOptions, ResolveAndLinkOptions } from './map-config.ts';

type LinkedBundle = Awaited<ReturnType<BundleLinker['linkBundle']>>;
type VersionedBundleWithManifest = Awaited<ReturnType<VersionManager['addVersion']>>;
type ResolveAndBuildDependencies = {
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly linker: BundleLinker;
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly resourceResolver: ResourceResolver;
    readonly versionManager: VersionManager;
};

function assertEsmMainPackageJson(mainPackageJson: { readonly type?: string | undefined }): void {
    if (mainPackageJson.type !== 'module') {
        throw new Error('mainPackageJson.type must be "module"');
    }
}

function maybeEmitScanCompleted(
    dependencies: Pick<ResolveAndBuildDependencies, 'progressBroadcaster'>,
    packageName: string,
    resolved: Parameters<typeof inspectScanResults>[0]
): void {
    if (dependencies.progressBroadcaster.hasSubscribers('scanCompleted')) {
        dependencies.progressBroadcaster.emit('scanCompleted', { packageName, ...inspectScanResults(resolved) });
    }
}

function maybeEmitLinkingCompleted(
    dependencies: Pick<ResolveAndBuildDependencies, 'progressBroadcaster'>,
    packageName: string,
    linked: LinkedBundle
): void {
    if (dependencies.progressBroadcaster.hasSubscribers('linkingCompleted')) {
        dependencies.progressBroadcaster.emit('linkingCompleted', {
            packageName,
            rewrites: inspectLinkerRewrites(linked)
        });
    }
}

async function analyzeOne(
    dependencies: Pick<ResolveAndBuildDependencies, 'deadCodeEliminator'>,
    linkedBundle: LinkedBundle,
    transformationsEnabled: boolean
): Promise<AnalyzedBundle> {
    const [analyzedBundle] = await dependencies.deadCodeEliminator.eliminate([
        { bundle: linkedBundle, transformationsEnabled }
    ]);
    if (analyzedBundle === undefined) {
        throw new Error(`Dead code eliminator returned no bundle for "${linkedBundle.name}"`);
    }

    return analyzedBundle;
}

export type ResolveAndBuildOperations = {
    readonly build: (options: BuildOptions) => Promise<VersionedBundleWithManifest>;
    readonly resolveAndLink: (options: ResolveAndLinkOptions) => Promise<LinkedBundle>;
};

export function createResolveAndBuildOperations(dependencies: ResolveAndBuildDependencies): ResolveAndBuildOperations {
    async function resolveAndLink(options: ResolveAndLinkOptions): Promise<LinkedBundle> {
        assertEsmMainPackageJson(options.mainPackageJson);
        dependencies.progressBroadcaster.emit('resolving', { packageName: options.name });
        const resolvedBundle = await dependencies.resourceResolver.resolve(options);
        maybeEmitScanCompleted(dependencies, options.name, resolvedBundle);
        dependencies.progressBroadcaster.emit('linking', { packageName: options.name });
        const linkedBundle = await dependencies.linker.linkBundle({
            bundle: resolvedBundle,
            bundleDependencies: [...options.bundleDependencies, ...options.bundlePeerDependencies]
        });
        maybeEmitLinkingCompleted(dependencies, options.name, linkedBundle);
        return linkedBundle;
    }

    async function build(options: BuildOptions): Promise<VersionedBundleWithManifest> {
        assertEsmMainPackageJson(options.mainPackageJson);
        const {
            additionalFiles,
            bundleDependencies,
            bundlePeerDependencies,
            includeSourceMapFiles,
            name,
            sourcesFolder
        } = options;
        const normalizedResolveInputs = resolveRootsAndSurface(options);
        const linkedBundle = await resolveAndLink({
            name,
            sourcesFolder,
            roots: normalizedResolveInputs.roots,
            surface: normalizedResolveInputs.surface,
            includeSourceMapFiles,
            additionalFiles,
            mainPackageJson: options.mainPackageJson,
            additionalPackageJsonAttributes: options.additionalPackageJsonAttributes,
            allowMutableSpecifiers: options.allowMutableSpecifiers,
            bundleDependencies,
            bundlePeerDependencies
        });

        const transformationsEnabled = options.deadCodeElimination?.enabled ?? true;
        const analyzedBundle = await analyzeOne(dependencies, linkedBundle, transformationsEnabled);
        return dependencies.versionManager.addVersion({
            bundle: analyzedBundle,
            version: options.version,
            mainPackageJson: options.mainPackageJson,
            bundleDependencies: options.bundleDependencies,
            bundlePeerDependencies: options.bundlePeerDependencies,
            additionalPackageJsonAttributes: options.additionalPackageJsonAttributes,
            allowMutableSpecifiers: options.allowMutableSpecifiers
        });
    }

    return { build, resolveAndLink };
}
