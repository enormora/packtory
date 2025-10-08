import type { Except } from 'type-fest';
import type { ExternalDependency } from '../dependency-scanner/external-dependencies.ts';
import { createDirectedGraph } from '../directed-graph/graph.ts';
import { uniqueList } from '../list/unique-list.ts';
import type { LinkedBundle, LinkedBundleResource } from './linked-bundle.ts';
import type { ResourceGraphNodeData } from './resource-graph.ts';

type SubstitutedResourceGraphNodeData = ResourceGraphNodeData & {
    readonly bundleDependencies: readonly string[];
    readonly isSubstituted: boolean;
};

export type SubstitutedResourceGraph = {
    add: (filePath: string, data: SubstitutedResourceGraphNodeData) => void;
    connect: (fromFilePath: string, toFilePath: string) => void;
    hasConnection: (fromFilePath: string, toFilePath: string) => boolean;
    isKnown: (filePath: string) => boolean;
    flatten: (entryPoints: string[]) => Except<LinkedBundle, 'entryPoints' | 'name'>;
};

function addOrCreateReference(
    externalDependencyName: string,
    reference: string,
    externalDependency?: ExternalDependency
): ExternalDependency {
    if (externalDependency === undefined) {
        return {
            name: externalDependencyName,
            referencedFrom: [reference]
        };
    }

    return {
        name: externalDependencyName,
        referencedFrom: uniqueList([...externalDependency.referencedFrom, reference])
    };
}

type FlattenCollectors = {
    readonly collect: (
        filePath: string,
        data: SubstitutedResourceGraphNodeData,
        directDependencies: ReadonlySet<string>
    ) => void;
    readonly contents: LinkedBundleResource[];
    readonly linkedBundleDependencies: Map<string, ExternalDependency>;
    readonly externalDependencies: Map<string, ExternalDependency>;
};

function createFlattenCollectors(): FlattenCollectors {
    const contents: LinkedBundleResource[] = [];
    const linkedBundleDependencies = new Map<string, ExternalDependency>();
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
            isExplicitlyIncluded: data.isExplicitlyIncluded
        });

        for (const bundleDependencyName of data.bundleDependencies) {
            const bundleDependency = linkedBundleDependencies.get(bundleDependencyName);
            linkedBundleDependencies.set(
                bundleDependencyName,
                addOrCreateReference(bundleDependencyName, filePath, bundleDependency)
            );
        }

        for (const externalDependencyName of data.externalDependencies) {
            const externalDependency = externalDependencies.get(externalDependencyName);
            externalDependencies.set(
                externalDependencyName,
                addOrCreateReference(externalDependencyName, filePath, externalDependency)
            );
        }
    }

    return { collect, contents, linkedBundleDependencies, externalDependencies };
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

        hasConnection(fromFilePath, toFilePath) {
            return graph.hasConnection({ from: fromFilePath, to: toFilePath });
        },

        flatten(entryPoints) {
            const { collect, contents, linkedBundleDependencies, externalDependencies } = createFlattenCollectors();

            for (const entryPoint of entryPoints) {
                graph.visitBreadthFirstSearch(entryPoint, (node) => {
                    collect(node.id, node.data, node.adjacentNodeIds);
                });
            }

            for (const [filePath, data] of nodeDataByFilePath) {
                if (data.isExplicitlyIncluded) {
                    const directDependencies = graph.getAdjacentIds(filePath);
                    collect(filePath, data, directDependencies);
                }
            }

            return {
                contents,
                linkedBundleDependencies,
                externalDependencies
            };
        }
    };
}
