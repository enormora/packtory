import { rootHasDeclarationFile, type ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import { substituteDependencies } from './substitute-bundles.ts';
import type { BundleSubstitutionSource, LinkedBundle } from './linked-bundle.ts';
import { createGraphFromResolvedBundle } from './resource-graph.ts';
import { ownsSourcePath } from './replacement-lookup.ts';

type LinkBundleOptions = {
    readonly bundle: ResolvedBundle;
    readonly bundleDependencies: readonly BundleSubstitutionSource[];
    readonly bundlePeerDependencies: readonly BundleSubstitutionSource[];
};

export type BundleLinker = {
    linkBundle: (options: LinkBundleOptions) => Promise<LinkedBundle>;
};

function flattenRoots(roots: ResolvedBundle['roots']): string[] {
    return Object.values(roots).flatMap(function (root) {
        if (rootHasDeclarationFile(root)) {
            return [ root.js.inputFilePath, root.declarationFile.inputFilePath ];
        }
        return [ root.js.inputFilePath ];
    });
}

function isSubstitutedBundleSourcePath(
    inputFilePath: string,
    bundleDependencies: readonly BundleSubstitutionSource[]
): boolean {
    return bundleDependencies.some(function (bundleDependency) {
        return ownsSourcePath(inputFilePath, bundleDependency);
    });
}

function declarationCompanionRoots(
    contents: ResolvedBundle['contents'],
    bundleDependencies: readonly BundleSubstitutionSource[]
): readonly string[] {
    const inputFilePaths = new Set(contents.map(function (content) {
        return content.fileDescription.inputFilePath;
    }));
    return contents.flatMap(function (content) {
        if (isSubstitutedBundleSourcePath(content.fileDescription.inputFilePath, bundleDependencies)) {
            return [];
        }
        return declarationCompanionCandidates(content.fileDescription.inputFilePath).filter(function (candidate) {
            return inputFilePaths.has(candidate) && !isSubstitutedBundleSourcePath(candidate, bundleDependencies);
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
            const { bundle, bundleDependencies, bundlePeerDependencies } = options;
            const substitutionSources = [ ...bundleDependencies, ...bundlePeerDependencies ];
            const resourceGraph = createGraphFromResolvedBundle(bundle);
            const substitutedGraph = substituteDependencies(resourceGraph, bundleDependencies, bundlePeerDependencies);

            return {
                ...substitutedGraph.flatten(flattenRootFilePaths(bundle, substitutionSources)),
                name: bundle.name,
                exportPackageJson: bundle.exportPackageJson,
                roots: bundle.roots,
                surface: bundle.surface
            };
        }
    };
}
