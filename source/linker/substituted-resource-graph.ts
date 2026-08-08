import { unique } from 'remeda';
import type { Except } from 'type-fest';
import type { ExternalDependency } from '../dependency-scanner/external-dependencies.ts';
import { createDirectedGraph } from '../directed-graph/graph.ts';
import type { LinkedBundle, LinkedBundleResource } from './linked-bundle.ts';
import type { ResourceGraphNodeData } from './resource-graph.ts';

type SubstitutedResourceGraphNodeData = ResourceGraphNodeData & {
    readonly bundleDependencies: readonly string[];
    readonly substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
    readonly isSubstituted: boolean;
};

export type SubstitutedResourceGraph = {
    add: (filePath: string, data: SubstitutedResourceGraphNodeData) => void;
    connect: (fromFilePath: string, toFilePath: string) => void;
    isKnown: (filePath: string) => boolean;
    flatten: (rootFilePaths: readonly string[]) => Except<LinkedBundle, 'name' | 'roots' | 'surface'>;
};

function addOrCreateReference(
    externalDependencyName: string,
    reference: string,
    externalDependency?: ExternalDependency
): ExternalDependency {
    if (externalDependency === undefined) {
        return {
            name: externalDependencyName,
            referencedFrom: [ reference ]
        };
    }

    return {
        name: externalDependencyName,
        referencedFrom: unique([ ...externalDependency.referencedFrom, reference ])
    };
}

type FlattenCollectors = {
    readonly collect: (
        filePath: string,
        data: SubstitutedResourceGraphNodeData,
        directDependencies: ReadonlySet<string>
    ) => void;
    readonly contents: readonly LinkedBundleResource[];
    readonly linkedBundleDependencies: ReadonlyMap<string, ExternalDependency>;
    readonly substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
    readonly externalDependencies: ReadonlyMap<string, ExternalDependency>;
};

type MutableExternalDependencyRecord = {
    readonly get: (key: string) => ExternalDependency | undefined;
    readonly set: (key: string, value: ExternalDependency) => unknown;
};

function collectLinkedBundleDependencies(
    linkedBundleDependencies: MutableExternalDependencyRecord,
    bundleDependencies: readonly string[],
    filePath: string
): void {
    for (const bundleDependencyName of bundleDependencies) {
        const bundleDependency = linkedBundleDependencies.get(bundleDependencyName);
        linkedBundleDependencies.set(
            bundleDependencyName,
            addOrCreateReference(bundleDependencyName, filePath, bundleDependency)
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
    dependencyNames: readonly string[],
    filePath: string
): void {
    for (const externalDependencyName of dependencyNames) {
        const externalDependency = externalDependencies.get(externalDependencyName);
        externalDependencies.set(
            externalDependencyName,
            addOrCreateReference(externalDependencyName, filePath, externalDependency)
        );
    }
}

function createFlattenCollectors(): FlattenCollectors {
    const contents: LinkedBundleResource[] = [];
    const linkedBundleDependencies = new Map<string, ExternalDependency>();
    const substitutedSourceFilePathsByPackageName = new Map<string, Set<string>>();
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
        collectExternalDependencies(externalDependencies, data.externalDependencies, filePath);
    }

    return {
        collect,
        contents,
        linkedBundleDependencies,
        substitutedSourceFilePathsByPackageName,
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
                externalDependencies
            };
        }
    };
}
