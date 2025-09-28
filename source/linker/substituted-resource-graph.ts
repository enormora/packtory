import type { Except } from 'type-fest';
import type { ExternalDependency } from '../dependency-scanner/external-dependencies.js';
import { createDirectedGraph } from '../directed-graph/graph.js';
import { uniqueList } from '../list/unique-list.js';
import type { LinkedBundle, LinkedBundleResource } from './linked-bundle.js';
import type { ResourceGraphNodeData } from './resource-graph.js';

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

export function createSubstitutedResourceGraph(): SubstitutedResourceGraph {
    const graph = createDirectedGraph<string, SubstitutedResourceGraphNodeData>();

    return {
        add(filePath, data) {
            graph.addNode(filePath, data);
        },

        isKnown: graph.hasNode,

        connect(fromFilePath, toFilePath) {
            graph.connect({ from: fromFilePath, to: toFilePath });
        },

        hasConnection(fromFilePath, toFilePath) {
            return graph.hasConnection({ from: fromFilePath, to: toFilePath });
        },

        flatten(entryPoints) {
            const contents: LinkedBundleResource[] = [];
            const linkedBundleDependencies = new Map<string, ExternalDependency>();
            const externalDependencies = new Map<string, ExternalDependency>();

            for (const entryPoint of entryPoints) {
                graph.visitBreadthFirstSearch(entryPoint, (node) => {
                    contents.push({
                        fileDescription: node.data.fileDescription,
                        directDependencies: node.adjacentNodeIds,
                        isSubstituted: node.data.isSubstituted
                    });

                    for (const bundleDependencyName of node.data.bundleDependencies) {
                        const bundleDependency = linkedBundleDependencies.get(bundleDependencyName);
                        linkedBundleDependencies.set(
                            bundleDependencyName,
                            addOrCreateReference(bundleDependencyName, node.id, bundleDependency)
                        );
                    }
                    for (const externalDependencyName of node.data.externalDependencies) {
                        const externalDependency = externalDependencies.get(externalDependencyName);
                        externalDependencies.set(
                            externalDependencyName,
                            addOrCreateReference(externalDependencyName, node.id, externalDependency)
                        );
                    }
                });
            }

            return {
                contents,
                linkedBundleDependencies,
                externalDependencies
            };
        }
    };
}
