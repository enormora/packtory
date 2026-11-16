import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import {
    createPathReplacementLookup,
    ownsSourcePath,
    type Replacements
} from './replacement-lookup.ts';
import type { ResourceGraph } from './resource-graph.ts';
import { collectImportRequirements } from './import-requirements.ts';
import {
    replaceImportPathsWithTransform,
    type ImportPathDependencyReference,
    type ImportPathReplacementResult
} from './source-modifier/import-paths.ts';
import { createSubstitutedResourceGraph, type SubstitutedResourceGraph } from './substituted-resource-graph.ts';

type ResourceGraphNode = Parameters<Parameters<ResourceGraph['traverse']>[0]>[0];
type OutstandingConnection = { readonly from: string; readonly to: string; };
type OutstandingConnectionSink = {
    readonly push: (connection: OutstandingConnection) => unknown;
};

function recordUnreplacedConnections(
    outstandingConnections: OutstandingConnectionSink,
    fromNodeIdentifier: string,
    directDependencies: readonly string[],
    replacedPaths: Pick<Replacements['importPathReplacements'], 'has'>
): void {
    for (const file of directDependencies) {
        if (!replacedPaths.has(file)) {
            outstandingConnections.push({ from: fromNodeIdentifier, to: file });
        }
    }
}

function contentWithReplacements(
    node: ResourceGraphNode,
    replacements: Replacements
): ImportPathReplacementResult {
    return replaceImportPathsWithTransform(
        node.data.project,
        node.data.fileDescription.inputFilePath,
        node.data.fileDescription.content,
        replacements.importPathReplacements
    );
}

function fallbackDependencyReferences(replacements: Replacements): readonly ImportPathDependencyReference[] {
    return Array.from(replacements.importPathReplacements.values(), function (replacement) {
        return {
            name: replacement.packageName,
            sourceSpecifier: replacement.emittedSpecifier,
            emittedSpecifier: replacement.emittedSpecifier
        };
    });
}

function referenceWithReplacement(
    reference: ArtifactModuleReference,
    replacements: Replacements,
    inputFilePathByTargetFilePath: ReadonlyMap<string, string>
): ArtifactModuleReference {
    if (
        reference.type !== 'local-code' &&
        reference.type !== 'local-asset' &&
        reference.type !== 'generated-manifest'
    ) {
        return reference;
    }
    const inputFilePath = inputFilePathByTargetFilePath.get(reference.targetFilePath);
    const replacementLookupPath = inputFilePath ?? reference.targetFilePath;
    const replacement = replacements.importPathReplacements.get(replacementLookupPath);
    if (replacement === undefined) {
        return reference;
    }
    return {
        type: 'linked-code',
        sourceSpecifier: reference.sourceSpecifier,
        emittedSpecifier: replacement.emittedSpecifier,
        packageName: replacement.packageName,
        targetFilePath: reference.targetFilePath
    };
}

function moduleReferencesWithReplacements(
    node: ResourceGraphNode,
    replacements: Replacements,
    inputFilePathByTargetFilePath: ReadonlyMap<string, string>
): readonly ArtifactModuleReference[] {
    return node.data.moduleReferences.map(function (reference) {
        return referenceWithReplacement(reference, replacements, inputFilePathByTargetFilePath);
    });
}

function addNodeWithReplacements(
    substitutedGraph: SubstitutedResourceGraph,
    node: ResourceGraphNode,
    replacements: Replacements,
    inputFilePathByTargetFilePath: ReadonlyMap<string, string>
): void {
    const isSubstituted = replacements.importPathReplacements.size > 0;
    const replacementResult = contentWithReplacements(node, replacements);
    const dependencyReferences = replacementResult.dependencyReferences.length === 0
        ? fallbackDependencyReferences(replacements)
        : replacementResult.dependencyReferences;
    const sourceMapTransformsByTargetPath = replacementResult.sourceMapTransform === undefined
        ? new Map()
        : new Map([ [ node.data.fileDescription.targetFilePath, [ replacementResult.sourceMapTransform ] ] ]);
    substitutedGraph.add(node.identifier, {
        fileDescription: { ...node.data.fileDescription, content: replacementResult.content },
        moduleReferences: moduleReferencesWithReplacements(node, replacements, inputFilePathByTargetFilePath),
        externalDependencies: node.data.externalDependencies,
        bundleDependencies: isSubstituted ? dependencyReferences : [],
        substitutedInputFilePathsByPackageName: replacements.substitutedInputFilePathsByPackageName,
        sourceMapTransformsByTargetPath,
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
    const findPathReplacements = createPathReplacementLookup(bundleDependencies, bundlePeerDependencies);
    const substitutedGraph = createSubstitutedResourceGraph();
    const outstandingConnections: OutstandingConnection[] = [];
    const visited = new Set<string>();

    function substituteNode(node: ResourceGraphNode): void {
        if (visited.has(node.identifier)) {
            return;
        }
        visited.add(node.identifier);
        if (
            !node.data.isExplicitlyIncluded && bundlePeerDependencies.some(function (peer) {
                return ownsSourcePath(node.identifier, peer);
            })
        ) {
            return;
        }

        const directDependencies = Array.from(node.adjacentNodeIdentifiers);
        const sourceFile = node.data.project?.getSourceFile(node.data.fileDescription.inputFilePath);
        const replacements = findPathReplacements(collectImportRequirements(sourceFile, node.adjacentNodeIdentifiers));
        recordUnreplacedConnections(
            outstandingConnections,
            node.identifier,
            directDependencies,
            replacements.importPathReplacements
        );
        addNodeWithReplacements(
            substitutedGraph,
            node,
            replacements,
            resourceGraph.inputFilePathByTargetFilePath
        );
    }

    resourceGraph.traverse(substituteNode);

    for (const connection of outstandingConnections) {
        substitutedGraph.connect(connection.from, connection.to);
    }

    return substitutedGraph;
}
