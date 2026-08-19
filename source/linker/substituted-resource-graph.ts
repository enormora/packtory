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
    readonly substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
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
        directDependencies: ReadonlySet<string>
    ) => void;
    readonly contents: readonly LinkedBundleResource[];
    readonly linkedBundleDependencies: ReadonlyMap<string, ExternalDependency>;
    readonly substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
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

function collectSubstitutedSourceFilePaths(
    target: ReadonlyMap<string, ReadonlySet<string>>,
    source: ReadonlyMap<string, ReadonlySet<string>>
): readonly (readonly [string, ReadonlySet<string>])[] {
    const result = new Map(target);
    for (const [ packageName, sourceFilePaths ] of source) {
        const existing = result.get(packageName) ?? [];
        result.set(packageName, new Set([ ...existing, ...sourceFilePaths ]));
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
    const substitutedSourceFilePathsByPackageName = new Map<string, Set<string>>();
    const sourceMapTransformsByTargetPath = new Map<string, readonly SourceMapTransform[]>();
    const externalDependencies = new Map<string, ExternalDependency>();
    const visited = new Set<string>();

    function collect(
        filePath: string,
        data: SubstitutedResourceGraphNodeData,
        directDependencies: ReadonlySet<string>
    ): void {
        if (visited.has(filePath)) {
            return;
        }

        visited.add(filePath);
        contents.push({
            fileDescription: data.fileDescription,
            directDependencies,
            isSubstituted: data.isSubstituted,
            isExplicitlyIncluded: data.isExplicitlyIncluded,
            ...data.isGeneratedManifest ? { isGeneratedManifest: true } : {}
        });

        collectLinkedBundleDependencies(linkedBundleDependencies, data.bundleDependencies, filePath);
        for (
            const [ packageName, sourceFilePaths ] of collectSubstitutedSourceFilePaths(
                substitutedSourceFilePathsByPackageName,
                data.substitutedSourceFilePathsByPackageName
            )
        ) {
            substitutedSourceFilePathsByPackageName.set(packageName, new Set(sourceFilePaths));
        }
        collectSourceMapTransforms(sourceMapTransformsByTargetPath, data.sourceMapTransformsByTargetPath);
        collectExternalDependencies(externalDependencies, data.externalDependencies, filePath);
    }

    return {
        collect,
        contents,
        linkedBundleDependencies,
        substitutedSourceFilePathsByPackageName,
        sourceMapTransformsByTargetPath,
        externalDependencies
    };
}

export function createSubstitutedResourceGraph(): SubstitutedResourceGraph {
    const graph = createDirectedGraph<string, SubstitutedResourceGraphNodeData>();
    const nodeDataByFilePath = new Map<string, SubstitutedResourceGraphNodeData>();

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
                substitutedSourceFilePathsByPackageName,
                sourceMapTransformsByTargetPath,
                externalDependencies
            } = createFlattenCollectors();

            for (const rootFilePath of rootFilePaths) {
                graph.visitBreadthFirstSearch(rootFilePath, function (node) {
                    collect(node.id, node.data, node.adjacentNodeIds);
                });
            }

            const includedNodes = Array.from(nodeDataByFilePath).filter(function ([ , data ]) {
                return data.isExplicitlyIncluded;
            });
            for (const [ filePath, data ] of includedNodes) {
                const directDependencies = graph.getAdjacentIds(filePath);
                collect(filePath, data, directDependencies);
            }

            return {
                contents,
                linkedBundleDependencies,
                substitutedSourceFilePathsByPackageName,
                sourceMapTransformsByTargetPath,
                externalDependencies
            };
        }
    };
}
