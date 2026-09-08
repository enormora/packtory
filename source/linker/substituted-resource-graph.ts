import type { Except } from 'type-fest';
import type { SourceMapTransform } from '../dead-code-eliminator/transform/atom-translator.ts';
import {
    mergeExternalDependencyReference,
    type DependencySpecifierReference,
    type ExternalDependency
} from '../dependency-scanner/external-dependencies.ts';
import { createDirectedGraph } from '../directed-graph/graph.ts';
import type { LinkedBundle, LinkedBundleResource } from './linked-bundle.ts';
import type { ResourceGraphNodeData } from './resource-graph.ts';

type SubstitutedResourceGraphNodeData = ResourceGraphNodeData & {
    readonly bundleDependencies: readonly (DependencySpecifierReference & { readonly name: string; })[];
    readonly substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
    readonly sourceMapTransformsByTargetPath: ReadonlyMap<string, readonly SourceMapTransform[]>;
    readonly isSubstituted: boolean;
};

export type SubstitutedResourceGraph = {
    add: (filePath: string, data: SubstitutedResourceGraphNodeData) => void;
    connect: (fromFilePath: string, toFilePath: string) => void;
    isKnown: (filePath: string) => boolean;
    flatten: (rootFilePaths: readonly string[]) => Except<LinkedBundle, 'name' | 'roots' | 'surface'>;
};

type FlattenCollectors = {
    readonly collect: (
        filePath: string,
        data: SubstitutedResourceGraphNodeData,
        directDependencies: ReadonlySet<string>,
        targetFilePathByInputFilePath: ReadonlyMap<string, string>
    ) => void;
    readonly contents: readonly LinkedBundleResource[];
    readonly linkedBundleDependencies: ReadonlyMap<string, ExternalDependency>;
    readonly substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
    readonly sourceMapTransformsByTargetPath: ReadonlyMap<string, readonly SourceMapTransform[]>;
    readonly externalDependencies: ReadonlyMap<string, ExternalDependency>;
};

type MutableExternalDependencyRecord = {
    readonly get: (key: string) => ExternalDependency | undefined;
    readonly set: (key: string, value: ExternalDependency) => unknown;
};

type MutableSourceMapTransformRecord = {
    readonly get: (key: string) => readonly SourceMapTransform[] | undefined;
    readonly set: (key: string, value: readonly SourceMapTransform[]) => unknown;
};

function collectLinkedBundleDependencies(
    linkedBundleDependencies: MutableExternalDependencyRecord,
    bundleDependencies: readonly (DependencySpecifierReference & { readonly name: string; })[],
    filePath: string
): void {
    for (const bundleDependencyReference of bundleDependencies) {
        const bundleDependency = linkedBundleDependencies.get(bundleDependencyReference.name);
        linkedBundleDependencies.set(
            bundleDependencyReference.name,
            mergeExternalDependencyReference(bundleDependencyReference, filePath, bundleDependency)
        );
    }
}

function collectSubstitutedInputFilePaths(
    target: ReadonlyMap<string, ReadonlySet<string>>,
    source: ReadonlyMap<string, ReadonlySet<string>>
): readonly (readonly [string, ReadonlySet<string>])[] {
    const result = new Map(target);
    for (const [ packageName, inputFilePaths ] of source) {
        const existing = result.get(packageName) ?? [];
        result.set(packageName, new Set([ ...existing, ...inputFilePaths ]));
    }
    return Array.from(result);
}

function collectExternalDependencies(
    externalDependencies: MutableExternalDependencyRecord,
    dependencies: readonly (DependencySpecifierReference & { readonly name: string; })[],
    filePath: string
): void {
    for (const dependencyReference of dependencies) {
        const externalDependency = externalDependencies.get(dependencyReference.name);
        externalDependencies.set(
            dependencyReference.name,
            mergeExternalDependencyReference(dependencyReference, filePath, externalDependency)
        );
    }
}

function directDependencyTargetPaths(
    directDependencies: ReadonlySet<string>,
    targetFilePathByInputFilePath: ReadonlyMap<string, string>
): ReadonlySet<string> {
    return new Set(
        Array.from(directDependencies, function (inputFilePath) {
            return targetFilePathByInputFilePath.get(inputFilePath) ?? inputFilePath;
        })
    );
}

function collectSourceMapTransforms(
    sourceMapTransformsByTargetPath: MutableSourceMapTransformRecord,
    source: ReadonlyMap<string, readonly SourceMapTransform[]>
): void {
    for (const [ targetPath, transforms ] of source) {
        const existing = sourceMapTransformsByTargetPath.get(targetPath) ?? [];
        sourceMapTransformsByTargetPath.set(targetPath, [ ...existing, ...transforms ]);
    }
}

function createFlattenCollectors(): FlattenCollectors {
    const contents: LinkedBundleResource[] = [];
    const linkedBundleDependencies = new Map<string, ExternalDependency>();
    const substitutedInputFilePathsByPackageName = new Map<string, Set<string>>();
    const sourceMapTransformsByTargetPath = new Map<string, readonly SourceMapTransform[]>();
    const externalDependencies = new Map<string, ExternalDependency>();
    const visited = new Set<string>();

    function collect(
        filePath: string,
        data: SubstitutedResourceGraphNodeData,
        directDependencies: ReadonlySet<string>,
        targetFilePathByInputFilePath: ReadonlyMap<string, string>
    ): void {
        if (visited.has(filePath)) {
            return;
        }

        visited.add(filePath);
        contents.push({
            fileDescription: data.fileDescription,
            directDependencies: directDependencyTargetPaths(directDependencies, targetFilePathByInputFilePath),
            moduleReferences: data.moduleReferences,
            isSubstituted: data.isSubstituted,
            isExplicitlyIncluded: data.isExplicitlyIncluded,
            ...data.isGeneratedManifest ? { isGeneratedManifest: true } : {}
        });

        collectLinkedBundleDependencies(
            linkedBundleDependencies,
            data.bundleDependencies,
            data.fileDescription.targetFilePath
        );
        for (
            const [ packageName, inputFilePaths ] of collectSubstitutedInputFilePaths(
                substitutedInputFilePathsByPackageName,
                data.substitutedInputFilePathsByPackageName
            )
        ) {
            substitutedInputFilePathsByPackageName.set(packageName, new Set(inputFilePaths));
        }
        collectSourceMapTransforms(sourceMapTransformsByTargetPath, data.sourceMapTransformsByTargetPath);
        collectExternalDependencies(
            externalDependencies,
            data.externalDependencies,
            data.fileDescription.targetFilePath
        );
    }

    return {
        collect,
        contents,
        linkedBundleDependencies,
        substitutedInputFilePathsByPackageName,
        sourceMapTransformsByTargetPath,
        externalDependencies
    };
}

export function createSubstitutedResourceGraph(): SubstitutedResourceGraph {
    const graph = createDirectedGraph<string, SubstitutedResourceGraphNodeData>();
    const nodeDataByFilePath = new Map<string, SubstitutedResourceGraphNodeData>();

    function targetFilePathByInputFilePath(): ReadonlyMap<string, string> {
        return new Map(
            Array.from(nodeDataByFilePath, function ([ filePath, data ]) {
                return [ filePath, data.fileDescription.targetFilePath ];
            })
        );
    }

    return {
        add(filePath, data) {
            graph.addNode(filePath, data);
            nodeDataByFilePath.set(filePath, data);
        },

        isKnown: graph.hasNode,

        connect(fromFilePath, toFilePath) {
            graph.connect({ from: fromFilePath, to: toFilePath });
        },

        flatten(rootFilePaths) {
            const {
                collect,
                contents,
                linkedBundleDependencies,
                substitutedInputFilePathsByPackageName,
                sourceMapTransformsByTargetPath,
                externalDependencies
            } = createFlattenCollectors();
            const targetPaths = targetFilePathByInputFilePath();

            for (const rootFilePath of rootFilePaths) {
                graph.visitBreadthFirstSearch(rootFilePath, function (node) {
                    collect(node.id, node.data, node.adjacentNodeIds, targetPaths);
                });
            }

            const includedNodes = Array.from(nodeDataByFilePath).filter(function ([ , data ]) {
                return data.isExplicitlyIncluded;
            });
            for (const [ filePath, data ] of includedNodes) {
                const directDependencies = graph.getAdjacentIds(filePath);
                collect(filePath, data, directDependencies, targetPaths);
            }

            return {
                contents,
                linkedBundleDependencies,
                substitutedInputFilePathsByPackageName,
                sourceMapTransformsByTargetPath,
                externalDependencies
            };
        }
    };
}
