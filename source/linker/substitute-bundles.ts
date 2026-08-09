import type { BundleSubstitutionSource } from './linked-bundle.ts';
import { findAllPathReplacements, ownsSourcePath, type Replacements } from './replacement-lookup.ts';
import type { ResourceGraph } from './resource-graph.ts';
import { replaceImportPaths } from './source-modifier/import-paths.ts';
import { createSubstitutedResourceGraph, type SubstitutedResourceGraph } from './substituted-resource-graph.ts';

type ResourceGraphNode = Parameters<Parameters<ResourceGraph['traverse']>[0]>[0];
type OutstandingConnection = { readonly from: string; readonly to: string; };
type OutstandingConnectionSink = {
    readonly push: (connection: OutstandingConnection) => unknown;
};

function isSubstitutionSourcePath(
    sourceFilePath: string,
    substitutionSources: readonly BundleSubstitutionSource[]
): boolean {
    return substitutionSources.some(function (bundle) {
        return ownsSourcePath(sourceFilePath, bundle);
    });
}

function recordUnreplacedConnections(
    outstandingConnections: OutstandingConnectionSink,
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

function contentWithReplacements(node: ResourceGraphNode, replacements: Replacements): string {
    return replaceImportPaths(
        node.data.project,
        node.data.fileDescription.sourceFilePath,
        node.data.fileDescription.content,
        replacements.importPathReplacements
    );
}

function addNodeWithReplacements(
    substitutedGraph: SubstitutedResourceGraph,
    node: ResourceGraphNode,
    replacements: Replacements
): void {
    const isSubstituted = replacements.importPathReplacements.size > 0;
    const content = contentWithReplacements(node, replacements);
    substitutedGraph.add(node.id, {
        fileDescription: { ...node.data.fileDescription, content },
        externalDependencies: node.data.externalDependencies,
        bundleDependencies: isSubstituted ? replacements.bundleDependencies : [],
        substitutedSourceFilePathsByPackageName: replacements.substitutedSourceFilePathsByPackageName,
        isSubstituted,
        isExplicitlyIncluded: node.data.isExplicitlyIncluded,
        ...node.data.isGeneratedManifest ? { isGeneratedManifest: true } : {}
    });
}

export function substituteDependencies(
    resourceGraph: ResourceGraph,
    bundleDependencies: readonly BundleSubstitutionSource[],
    bundlePeerDependencies: readonly BundleSubstitutionSource[]
): SubstitutedResourceGraph {
    const substitutedGraph = createSubstitutedResourceGraph();
    const outstandingConnections: OutstandingConnection[] = [];
    const visited = new Set<string>();
    const substitutionSources = [ ...bundleDependencies, ...bundlePeerDependencies ];

    function substituteNode(node: ResourceGraphNode): void {
        if (visited.has(node.id)) {
            return;
        }
        visited.add(node.id);
        if (!node.data.isExplicitlyIncluded && isSubstitutionSourcePath(node.id, substitutionSources)) {
            return;
        }

        const directDependencies = Array.from(node.adjacentNodeIds);
        const replacements = findAllPathReplacements(directDependencies, bundleDependencies, bundlePeerDependencies);
        recordUnreplacedConnections(
            outstandingConnections,
            node.id,
            directDependencies,
            replacements.importPathReplacements
        );
        addNodeWithReplacements(substitutedGraph, node, replacements);
    }

    resourceGraph.traverse(substituteNode);

    for (const connection of outstandingConnections) {
        substitutedGraph.connect(connection.from, connection.to);
    }

    return substitutedGraph;
}
