import { Maybe } from 'true-myth';
import { getPublicModuleSpecifierForSourcePath } from '../package-surface/modules.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import type { ResourceGraph } from './resource-graph.ts';
import { createSubstitutedResourceGraph, type SubstitutedResourceGraph } from './substituted-resource-graph.ts';
import { replaceImportPaths } from './source-modifier/import-paths.ts';

type Replacement = {
    readonly targetPath: string;
    readonly packageName: string;
};

function ownsSourcePath(file: string, bundle: BundleSubstitutionSource): boolean {
    return bundle.contents.some((content) => {
        return content.fileDescription.sourceFilePath === file;
    });
}

function findReplacement(file: string, bundleDependencies: readonly BundleSubstitutionSource[]): Maybe<Replacement> {
    for (const bundle of bundleDependencies) {
        const targetPath = getPublicModuleSpecifierForSourcePath(bundle, file);
        if (targetPath !== undefined) {
            return Maybe.just({
                targetPath,
                packageName: bundle.name
            });
        }
        if (ownsSourcePath(file, bundle)) {
            throw new Error(`Package "${bundle.name}" does not expose "${file}" for cross-package substitution`);
        }
    }

    return Maybe.nothing();
}

type Replacements = {
    readonly importPathReplacements: Map<string, string>;
    readonly bundleDependencies: readonly string[];
};

function findAllPathReplacements(
    files: readonly string[],
    bundleDependencies: readonly BundleSubstitutionSource[]
): Replacements {
    const matched = files.flatMap((file) => {
        const result = findReplacement(file, bundleDependencies);
        if (!result.isJust) {
            return [];
        }
        const { targetPath, packageName } = result.value;
        return [{ file, targetPath, packageName }];
    });

    return {
        importPathReplacements: new Map(
            matched.map((entry) => {
                return [entry.file, entry.targetPath];
            })
        ),
        bundleDependencies: matched.map((entry) => {
            return entry.packageName;
        })
    };
}

export function substituteDependencies(
    resourceGraph: ResourceGraph,
    bundleDependencies: readonly BundleSubstitutionSource[]
): SubstitutedResourceGraph {
    const substitutedGraph = createSubstitutedResourceGraph();
    const outstandingConnections: { from: string; to: string }[] = [];
    const visited = new Set<string>();

    function recordOutstandingConnections(
        fromNodeId: string,
        directDependencies: readonly string[],
        replacedPaths: Pick<Replacements['importPathReplacements'], 'has'>
    ): void {
        for (const file of directDependencies) {
            if (!replacedPaths.has(file)) {
                outstandingConnections.push({ from: fromNodeId, to: file });
            }
        }
    }

    function contentWithReplacements(
        node: Parameters<Parameters<ResourceGraph['traverse']>[0]>[0],
        replacements: Replacements
    ): string {
        return replaceImportPaths(
            node.data.project,
            node.data.fileDescription.sourceFilePath,
            node.data.fileDescription.content,
            replacements.importPathReplacements
        );
    }

    resourceGraph.traverse((node) => {
        if (visited.has(node.id)) {
            return;
        }
        visited.add(node.id);

        const directDependencies = Array.from(node.adjacentNodeIds);
        const replacements = findAllPathReplacements(directDependencies, bundleDependencies);
        recordOutstandingConnections(node.id, directDependencies, replacements.importPathReplacements);

        const isSubstituted = replacements.importPathReplacements.size > 0;
        const content = contentWithReplacements(node, replacements);
        substitutedGraph.add(node.id, {
            fileDescription: { ...node.data.fileDescription, content },
            externalDependencies: node.data.externalDependencies,
            bundleDependencies: isSubstituted ? replacements.bundleDependencies : [],
            isSubstituted,
            isExplicitlyIncluded: node.data.isExplicitlyIncluded
        });
    });

    for (const connection of outstandingConnections) {
        substitutedGraph.connect(connection.from, connection.to);
    }

    return substitutedGraph;
}
