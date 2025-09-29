import type { ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { substituteDependencies } from './substitute-bundles.ts';
import type { LinkedBundle } from './linked-bundle.ts';
import { createGraphFromResolvedBundle } from './resource-graph.ts';

type LinkBundleOptions = {
    readonly bundle: ResolvedBundle;
    readonly bundleDependencies: readonly VersionedBundleWithManifest[];
};

export type BundleLinker = {
    linkBundle: (options: LinkBundleOptions) => Promise<LinkedBundle>;
};

function flattenEntryPoints(entryPoints: ResolvedBundle['entryPoints']): string[] {
    return entryPoints.flatMap((entryPoint) => {
        if (entryPoint.declarationFile !== undefined) {
            return [entryPoint.js.sourceFilePath, entryPoint.declarationFile.sourceFilePath];
        }
        return [entryPoint.js.sourceFilePath];
    });
}

export function createBundleLinker(): BundleLinker {
    return {
        async linkBundle(options) {
            const { bundle, bundleDependencies } = options;
            const resourceGraph = createGraphFromResolvedBundle(bundle);
            const substitutedGraph = substituteDependencies(resourceGraph, bundleDependencies);

            return {
                ...substitutedGraph.flatten(flattenEntryPoints(bundle.entryPoints)),
                name: bundle.name,
                entryPoints: bundle.entryPoints
            };
        }
    };
}
