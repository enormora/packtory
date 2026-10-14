import type { AnalyzedBundle, DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import type { BundleLinker } from '../linker/linker.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import { resolveRootsAndSurface } from '../resource-resolver/resource-resolve-options.ts';
import type { ResourceResolver } from '../resource-resolver/resource-resolver.ts';
import { inspectLinkerRewrites } from '../report/inspectors/inspect-linker-rewrites.ts';
import { inspectScanResults, type ScanInspectionInput } from '../report/inspectors/inspect-scan-results.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { BuildOptions, ResolveAndLinkOptions } from './map-configuration.ts';

type LinkedBundle = Awaited<ReturnType<BundleLinker['linkBundle']>>;
type VersionedBundleWithManifest = Awaited<ReturnType<VersionManager['addVersion']>>;
type ResolvedBundle = Awaited<ReturnType<ResourceResolver['resolve']>>;
type MainPackageTypeField = { readonly type?: string | undefined; };
export type ResolveAndBuildDependencies = {
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly linker: BundleLinker;
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly resourceResolver: ResourceResolver;
    readonly versionManager: VersionManager;
};

function assertEcmaScriptModuleMainPackageManifest(mainPackageManifest: MainPackageTypeField): void {
    if (mainPackageManifest.type !== 'module') {
        throw new Error('mainPackageManifest.type must be "module"');
    }
}

function maybeEmitScanCompleted(
    dependencies: Pick<ResolveAndBuildDependencies, 'progressBroadcaster'>,
    packageName: string,
    resolved: ScanInspectionInput
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
    transformationsEnabled: boolean,
    deadCodeElimination: DeadCodeEliminationSettings | undefined
): Promise<AnalyzedBundle> {
    const [ analyzedBundle ] = await dependencies.deadCodeEliminator.eliminate([
        {
            bundle: linkedBundle,
            transformationsEnabled,
            substitutionPublicModuleInputFilePaths: new Set<string>(),
            deadCodeElimination
        }
    ]);
    if (analyzedBundle === undefined) {
        throw new Error(`Dead code eliminator returned no bundle for "${linkedBundle.name}"`);
    }

    return analyzedBundle;
}

export type ResolveAndBuildOperations = {
    readonly build: (options: BuildOptions) => Promise<VersionedBundleWithManifest>;
    readonly resolveAndLink: (options: ResolveAndLinkOptions) => Promise<LinkedBundle>;
    readonly resolveAndLinkWithPromotedDeclarationCompanions: (
        options: ResolveAndLinkOptions,
        substitutedInputFilePaths: ReadonlySet<string>
    ) => Promise<LinkedBundle>;
};

export function createResolveAndBuildOperations(dependencies: ResolveAndBuildDependencies): ResolveAndBuildOperations {
    async function linkResolvedBundle(
        options: ResolveAndLinkOptions,
        resolvedBundle: ResolvedBundle
    ): Promise<LinkedBundle> {
        maybeEmitScanCompleted(dependencies, options.name, resolvedBundle);
        dependencies.progressBroadcaster.emit('linking', { packageName: options.name });
        const linkedBundle = await dependencies.linker.linkBundle({
            bundle: resolvedBundle,
            bundleDependencies: options.bundleDependencies,
            bundlePeerDependencies: options.bundlePeerDependencies
        });
        maybeEmitLinkingCompleted(dependencies, options.name, linkedBundle);
        return linkedBundle;
    }

    async function resolveAndLinkResolvedBundle(
        options: ResolveAndLinkOptions,
        resolveBundle: () => Promise<ResolvedBundle>
    ): Promise<LinkedBundle> {
        assertEcmaScriptModuleMainPackageManifest(options.mainPackageManifest);
        dependencies.progressBroadcaster.emit('resolving', { packageName: options.name });
        return await linkResolvedBundle(options, await resolveBundle());
    }

    async function resolveAndLinkWithPromotedDeclarations(
        options: ResolveAndLinkOptions,
        promotedDeclarationEntryFiles: readonly string[]
    ): Promise<LinkedBundle> {
        return await resolveAndLinkResolvedBundle(options, async function () {
            return await dependencies.resourceResolver.resolveWithPromotedDeclarations(
                options,
                promotedDeclarationEntryFiles
            );
        });
    }

    async function resolveAndLink(options: ResolveAndLinkOptions): Promise<LinkedBundle> {
        return await resolveAndLinkWithPromotedDeclarations(options, []);
    }

    async function resolveAndLinkWithPromotedDeclarationCompanions(
        options: ResolveAndLinkOptions,
        substitutedInputFilePaths: ReadonlySet<string>
    ): Promise<LinkedBundle> {
        return await resolveAndLinkResolvedBundle(options, async function () {
            return await dependencies.resourceResolver.resolveWithPromotedDeclarationCompanions(
                options,
                substitutedInputFilePaths
            );
        });
    }

    async function build(options: BuildOptions): Promise<VersionedBundleWithManifest> {
        assertEcmaScriptModuleMainPackageManifest(options.mainPackageManifest);
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
            mainPackageManifest: options.mainPackageManifest,
            additionalChangelogSourceFiles: { packageFiles: [], sharedFiles: [] },
            additionalPackageManifestAttributes: options.additionalPackageManifestAttributes,
            allowMutableSpecifiers: options.allowMutableSpecifiers,
            bundleDependencies,
            bundlePeerDependencies
        });

        const transformationsEnabled = options.deadCodeElimination?.enabled ?? true;
        const analyzedBundle = await analyzeOne(
            dependencies,
            linkedBundle,
            transformationsEnabled,
            options.deadCodeElimination
        );
        return dependencies.versionManager.addVersion({
            bundle: analyzedBundle,
            version: options.version,
            mainPackageManifest: options.mainPackageManifest,
            bundleDependencies: options.bundleDependencies,
            bundlePeerDependencies: options.bundlePeerDependencies,
            additionalPackageManifestAttributes: options.additionalPackageManifestAttributes,
            allowMutableSpecifiers: options.allowMutableSpecifiers
        });
    }

    return { build, resolveAndLink, resolveAndLinkWithPromotedDeclarationCompanions };
}
