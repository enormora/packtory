import type { ExportDeclaration, ImportDeclaration, SourceFile } from 'ts-morph';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';
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
    readonly get: (inputFilePath: string) => ImportPathReplacementRequest | undefined;
    readonly set: (inputFilePath: string, request: ImportPathReplacementRequest) => unknown;
    readonly values: () => IterableIterator<ImportPathReplacementRequest>;
};
type OutstandingConnection = { readonly from: string; readonly to: string; };
type OutstandingConnectionSink = {
    readonly push: (connection: OutstandingConnection) => unknown;
};

function isSubstitutionSourcePath(
    inputFilePath: string,
    substitutionSources: readonly BundleSubstitutionSource[]
): boolean {
    return substitutionSources.some(function (bundle) {
        return ownsSourcePath(inputFilePath, bundle);
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

function createReplacementRequest(inputFilePath: string): ImportPathReplacementRequest {
    return {
        inputFilePath,
        requiredExportNames: new Set(),
        requiresNamespaceExport: false
    };
}

function replacementRequestForInputFilePath(
    requestsByInputFilePath: ReplacementRequestRecord,
    inputFilePath: string
): ImportPathReplacementRequest {
    return requestsByInputFilePath.get(inputFilePath) ?? createReplacementRequest(inputFilePath);
}

function addRequiredExportName(
    requestsByInputFilePath: ReplacementRequestRecord,
    inputFilePath: string,
    requiredExportName: string
): void {
    const request = replacementRequestForInputFilePath(requestsByInputFilePath, inputFilePath);
    requestsByInputFilePath.set(inputFilePath, {
        ...request,
        requiredExportNames: new Set([ ...request.requiredExportNames, requiredExportName ])
    });
}

function requireNamespaceExport(
    requestsByInputFilePath: ReplacementRequestRecord,
    inputFilePath: string
): void {
    const request = replacementRequestForInputFilePath(requestsByInputFilePath, inputFilePath);
    requestsByInputFilePath.set(inputFilePath, { ...request, requiresNamespaceExport: true });
}

function recordImportRequirements(
    requestsByInputFilePath: ReplacementRequestRecord,
    declaration: ImportDeclaration
): void {
    const importedSourceFile = declaration.getModuleSpecifierSourceFile();
    if (importedSourceFile === undefined) {
        return;
    }
    const inputFilePath = importedSourceFile.getFilePath();
    if (declaration.getDefaultImport() !== undefined) {
        addRequiredExportName(requestsByInputFilePath, inputFilePath, 'default');
    }
    if (declaration.getNamespaceImport() !== undefined) {
        requireNamespaceExport(requestsByInputFilePath, inputFilePath);
    }
    for (const namedImport of declaration.getNamedImports()) {
        addRequiredExportName(requestsByInputFilePath, inputFilePath, namedImport.getName());
    }
}

function recordExportRequirements(
    requestsByInputFilePath: ReplacementRequestRecord,
    declaration: ExportDeclaration
): void {
    const exportedSourceFile = declaration.getModuleSpecifierSourceFile();
    if (exportedSourceFile === undefined) {
        return;
    }
    const inputFilePath = exportedSourceFile.getFilePath();
    if (declaration.isNamespaceExport()) {
        requireNamespaceExport(requestsByInputFilePath, inputFilePath);
    }
    for (const namedExport of declaration.getNamedExports()) {
        addRequiredExportName(requestsByInputFilePath, inputFilePath, namedExport.getName());
    }
}

function recordStaticRequirements(
    requestsByInputFilePath: ReplacementRequestRecord,
    sourceFile: SourceFile
): void {
    for (const declaration of sourceFile.getImportDeclarations()) {
        recordImportRequirements(requestsByInputFilePath, declaration);
    }
    for (const declaration of sourceFile.getExportDeclarations()) {
        recordExportRequirements(requestsByInputFilePath, declaration);
    }
}

function collectImportRequirements(node: ResourceGraphNode): readonly ImportPathReplacementRequest[] {
    const requestsByInputFilePath = new Map<string, ImportPathReplacementRequest>();
    for (const inputFilePath of node.adjacentNodeIds) {
        requestsByInputFilePath.set(inputFilePath, createReplacementRequest(inputFilePath));
    }
    const sourceFile = node.data.project?.getSourceFile(node.data.fileDescription.inputFilePath);
    if (sourceFile !== undefined) {
        recordStaticRequirements(requestsByInputFilePath, sourceFile);
    }
    return Array.from(requestsByInputFilePath.values());
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
    substitutedGraph.add(node.id, {
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
