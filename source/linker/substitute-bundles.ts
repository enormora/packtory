import type { BundleSubstitutionSource } from './linked-bundle.ts';
import { findAllPathReplacements, type Replacements } from './replacement-lookup.ts';
import type { ResourceGraph } from './resource-graph.ts';
import { replaceImportPaths } from './source-modifier/import-paths.ts';
import { createSubstitutedResourceGraph, type SubstitutedResourceGraph } from './substituted-resource-graph.ts';

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
            isExplicitlyIncluded: node.data.isExplicitlyIncluded,
            ...(node.data.isGeneratedManifest ? { isGeneratedManifest: true } : {})
        });
    });

    for (const connection of outstandingConnections) {
        substitutedGraph.connect(connection.from, connection.to);
    }

    return substitutedGraph;
}
