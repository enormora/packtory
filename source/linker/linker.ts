import { rootHasDeclarationFile, type ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import { substituteDependencies } from './substitute-bundles.ts';
import type { BundleSubstitutionSource, LinkedBundle } from './linked-bundle.ts';
import { createGraphFromResolvedBundle } from './resource-graph.ts';

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

function declarationCompanionRoots(
    contents: ResolvedBundle['contents'],
    retainedInputFilePaths: ReadonlySet<string>,
    substitutedInputFilePaths: ReadonlySet<string>
): readonly string[] {
    const inputFilePaths = new Set(contents.map(function (content) {
        return content.fileDescription.inputFilePath;
    }));
    return contents.flatMap(function (content) {
        if (!retainedInputFilePaths.has(content.fileDescription.inputFilePath)) {
            return [];
        }
        return declarationCompanionCandidates(content.fileDescription.inputFilePath).filter(function (candidate) {
            return inputFilePaths.has(candidate) && !substitutedInputFilePaths.has(candidate);
        });
    });
}

export function createBundleLinker(): BundleLinker {
    return {
        async linkBundle(options) {
            const { bundle, bundleDependencies, bundlePeerDependencies } = options;
            const resourceGraph = createGraphFromResolvedBundle(bundle);
            const substitutedGraph = substituteDependencies(resourceGraph, bundleDependencies, bundlePeerDependencies);

            const rootFilePaths = flattenRoots(bundle.roots);
            const retained = substitutedGraph.flatten(rootFilePaths);
            const retainedInputFilePaths = new Set(
                retained.contents.map(function (content) {
                    return content.fileDescription.inputFilePath;
                })
            );
            const substitutedInputFilePaths = new Set(
                Array.from(retained.substitutedInputFilePathsByPackageName.values()).flatMap(function (inputFilePaths) {
                    return Array.from(inputFilePaths);
                })
            );
            const companionRoots = declarationCompanionRoots(
                bundle.contents,
                retainedInputFilePaths,
                substitutedInputFilePaths
            );

            return {
                ...substitutedGraph.flatten([ ...rootFilePaths, ...companionRoots ]),
                name: bundle.name,
                exportPackageJson: bundle.exportPackageJson,
                roots: bundle.roots,
                surface: bundle.surface
            };
        }
    };
}
