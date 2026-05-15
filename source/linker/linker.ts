import type { ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';
import { substituteDependencies } from './substitute-bundles.ts';
import type { BundleSubstitutionSource, LinkedBundle } from './linked-bundle.ts';
import { createGraphFromResolvedBundle } from './resource-graph.ts';

type LinkBundleOptions = {
    readonly bundle: ResolvedBundle;
    readonly bundleDependencies: readonly BundleSubstitutionSource[];
};

export type BundleLinker = {
    linkBundle: (options: LinkBundleOptions) => Promise<LinkedBundle>;
};

function flattenRoots(roots: ResolvedBundle['roots']): string[] {
    return Object.values(roots).flatMap((root) => {
        if (root.declarationFile !== undefined) {
            return [root.js.sourceFilePath, root.declarationFile.sourceFilePath];
        }
        return [root.js.sourceFilePath];
    });
}

export function createBundleLinker(): BundleLinker {
    return {
        async linkBundle(options) {
            const { bundle, bundleDependencies } = options;
            const resourceGraph = createGraphFromResolvedBundle(bundle);
            const substitutedGraph = substituteDependencies(resourceGraph, bundleDependencies);

            return {
                ...substitutedGraph.flatten(flattenRoots(bundle.roots)),
                name: bundle.name,
                roots: bundle.roots,
                surface: bundle.surface
            };
        }
    };
}
