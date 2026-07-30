import { rootHasDeclarationFile, type ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import { substituteDependencies } from './substitute-bundles.ts';
import type { BundleSubstitutionSource, LinkedBundle } from './linked-bundle.ts';
import { createGraphFromResolvedBundle } from './resource-graph.ts';
import { ownsSourcePath } from './replacement-lookup.ts';

type LinkBundleOptions = {
    readonly bundle: ResolvedBundle;
    readonly bundleDependencies: readonly BundleSubstitutionSource[];
};

export type BundleLinker = {
    linkBundle: (options: LinkBundleOptions) => Promise<LinkedBundle>;
};

function flattenRoots(roots: ResolvedBundle['roots']): string[] {
    return Object.values(roots).flatMap(function (root) {
        if (rootHasDeclarationFile(root)) {
            return [ root.js.sourceFilePath, root.declarationFile.sourceFilePath ];
        }
        return [ root.js.sourceFilePath ];
    });
}

function isSubstitutedBundleSourcePath(
    sourceFilePath: string,
    bundleDependencies: readonly BundleSubstitutionSource[]
): boolean {
    return bundleDependencies.some(function (bundleDependency) {
        return ownsSourcePath(sourceFilePath, bundleDependency);
    });
}

function declarationCompanionRoots(
    contents: ResolvedBundle['contents'],
    bundleDependencies: readonly BundleSubstitutionSource[]
): readonly string[] {
    const sourceFilePaths = new Set(contents.map(function (content) {
        return content.fileDescription.sourceFilePath;
    }));
    return contents.flatMap(function (content) {
        if (isSubstitutedBundleSourcePath(content.fileDescription.sourceFilePath, bundleDependencies)) {
            return [];
        }
        return declarationCompanionCandidates(content.fileDescription.sourceFilePath).filter(function (candidate) {
            return sourceFilePaths.has(candidate);
        });
    });
}

function flattenRootFilePaths(
    bundle: ResolvedBundle,
    bundleDependencies: readonly BundleSubstitutionSource[]
): readonly string[] {
    return [ ...flattenRoots(bundle.roots), ...declarationCompanionRoots(bundle.contents, bundleDependencies) ];
}

export function createBundleLinker(): BundleLinker {
    return {
        async linkBundle(options) {
            const { bundle, bundleDependencies } = options;
            const resourceGraph = createGraphFromResolvedBundle(bundle);
            const substitutedGraph = substituteDependencies(resourceGraph, bundleDependencies);

            return {
                ...substitutedGraph.flatten(flattenRootFilePaths(bundle, bundleDependencies)),
                name: bundle.name,
                exportPackageJson: bundle.exportPackageJson,
                roots: bundle.roots,
                surface: bundle.surface
            };
        }
    };
}
