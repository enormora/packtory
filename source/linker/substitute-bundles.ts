import type { ExportDeclaration, ImportDeclaration, SourceFile } from 'ts-morph';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import {
    findAllPathReplacements,
    ownsSourcePath,
    type ImportPathReplacementRequest,
    type Replacements
} from './replacement-lookup.ts';
import type { ResourceGraph } from './resource-graph.ts';
import {
    replaceImportPathsWithTransform,
    type ImportPathDependencyReference,
    type ImportPathReplacementResult
} from './source-modifier/import-paths.ts';
import { createSubstitutedResourceGraph, type SubstitutedResourceGraph } from './substituted-resource-graph.ts';

type ResourceGraphNode = Parameters<Parameters<ResourceGraph['traverse']>[0]>[0];
type ReplacementRequestRecord = {
    readonly get: (sourceFilePath: string) => ImportPathReplacementRequest | undefined;
    readonly set: (sourceFilePath: string, request: ImportPathReplacementRequest) => unknown;
    readonly values: () => IterableIterator<ImportPathReplacementRequest>;
};
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

function createReplacementRequest(sourceFilePath: string): ImportPathReplacementRequest {
    return {
        sourceFilePath,
        requiredExportNames: new Set(),
        requiresNamespaceExport: false
    };
}

function replacementRequestForSourceFilePath(
    requestsBySourceFilePath: ReplacementRequestRecord,
    sourceFilePath: string
): ImportPathReplacementRequest {
    return requestsBySourceFilePath.get(sourceFilePath) ?? createReplacementRequest(sourceFilePath);
}

function addRequiredExportName(
    requestsBySourceFilePath: ReplacementRequestRecord,
    sourceFilePath: string,
    requiredExportName: string
): void {
    const request = replacementRequestForSourceFilePath(requestsBySourceFilePath, sourceFilePath);
    requestsBySourceFilePath.set(sourceFilePath, {
        ...request,
        requiredExportNames: new Set([ ...request.requiredExportNames, requiredExportName ])
    });
}

function requireNamespaceExport(
    requestsBySourceFilePath: ReplacementRequestRecord,
    sourceFilePath: string
): void {
    const request = replacementRequestForSourceFilePath(requestsBySourceFilePath, sourceFilePath);
    requestsBySourceFilePath.set(sourceFilePath, { ...request, requiresNamespaceExport: true });
}

function recordImportRequirements(
    requestsBySourceFilePath: ReplacementRequestRecord,
    declaration: ImportDeclaration
): void {
    const importedSourceFile = declaration.getModuleSpecifierSourceFile();
    if (importedSourceFile === undefined) {
        return;
    }
    const sourceFilePath = importedSourceFile.getFilePath();
    if (declaration.getDefaultImport() !== undefined) {
        addRequiredExportName(requestsBySourceFilePath, sourceFilePath, 'default');
    }
    if (declaration.getNamespaceImport() !== undefined) {
        requireNamespaceExport(requestsBySourceFilePath, sourceFilePath);
    }
    for (const namedImport of declaration.getNamedImports()) {
        addRequiredExportName(requestsBySourceFilePath, sourceFilePath, namedImport.getName());
    }
}

function recordExportRequirements(
    requestsBySourceFilePath: ReplacementRequestRecord,
    declaration: ExportDeclaration
): void {
    const exportedSourceFile = declaration.getModuleSpecifierSourceFile();
    if (exportedSourceFile === undefined) {
        return;
    }
    const sourceFilePath = exportedSourceFile.getFilePath();
    if (declaration.isNamespaceExport()) {
        requireNamespaceExport(requestsBySourceFilePath, sourceFilePath);
    }
    for (const namedExport of declaration.getNamedExports()) {
        addRequiredExportName(requestsBySourceFilePath, sourceFilePath, namedExport.getName());
    }
}

function recordStaticRequirements(
    requestsBySourceFilePath: ReplacementRequestRecord,
    sourceFile: SourceFile
): void {
    for (const declaration of sourceFile.getImportDeclarations()) {
        recordImportRequirements(requestsBySourceFilePath, declaration);
    }
    for (const declaration of sourceFile.getExportDeclarations()) {
        recordExportRequirements(requestsBySourceFilePath, declaration);
    }
}

function collectImportRequirements(node: ResourceGraphNode): readonly ImportPathReplacementRequest[] {
    const requestsBySourceFilePath = new Map<string, ImportPathReplacementRequest>();
    for (const sourceFilePath of node.adjacentNodeIds) {
        requestsBySourceFilePath.set(sourceFilePath, createReplacementRequest(sourceFilePath));
    }
    const sourceFile = node.data.project?.getSourceFile(node.data.fileDescription.sourceFilePath);
    if (sourceFile !== undefined) {
        recordStaticRequirements(requestsBySourceFilePath, sourceFile);
    }
    return Array.from(requestsBySourceFilePath.values());
}

function contentWithReplacements(
    node: ResourceGraphNode,
    replacements: Replacements
): ImportPathReplacementResult {
    return replaceImportPathsWithTransform(
        node.data.project,
        node.data.fileDescription.sourceFilePath,
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

function addNodeWithReplacements(
    substitutedGraph: SubstitutedResourceGraph,
    node: ResourceGraphNode,
    replacements: Replacements
): void {
    const isSubstituted = replacements.importPathReplacements.size > 0;
    const replacementResult = contentWithReplacements(node, replacements);
    const dependencyReferences = replacementResult.dependencyReferences.length === 0
        ? fallbackDependencyReferences(replacements)
        : replacementResult.dependencyReferences;
    const sourceMapTransformsByTargetPath = replacementResult.sourceMapTransform === undefined
        ? new Map()
        : new Map([ [ node.data.fileDescription.targetFilePath, [ replacementResult.sourceMapTransform ] ] ]);
    substitutedGraph.add(node.id, {
        fileDescription: { ...node.data.fileDescription, content: replacementResult.content },
        externalDependencies: node.data.externalDependencies,
        bundleDependencies: isSubstituted ? dependencyReferences : [],
        substitutedSourceFilePathsByPackageName: replacements.substitutedSourceFilePathsByPackageName,
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
        const replacements = findAllPathReplacements(
            collectImportRequirements(node),
            bundleDependencies,
            bundlePeerDependencies
        );
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
