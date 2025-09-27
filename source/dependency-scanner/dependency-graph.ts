import type { Maybe } from 'true-myth';
import type { Project } from 'ts-morph';
import { createDirectedGraph } from '../directed-graph/graph.js';
import { uniqueList } from '../list/unique-list.js';
import {
    mergeExternalDependencies,
    type ExternalDependencies,
    type ExternalDependency
} from './external-dependencies.js';
import type { TypescriptProject } from './typescript-project-analyzer.js';

export type DependencyGraphNodeData = {
    readonly sourceMapFilePath: Maybe<string>;
    readonly project: TypescriptProject;
    readonly externalDependencies: readonly string[];
};

export type DependencyNode = DependencyGraphNodeData & {
    readonly filePath: string;
    readonly localFiles: readonly string[];
};

export type LocalFile = {
    readonly filePath: string;
    readonly directDependencies: ReadonlySet<string>;
    readonly project?: Project | undefined;
};

export type DependencyFiles = {
    readonly localFiles: readonly LocalFile[];
    readonly externalDependencies: ExternalDependencies;
};

export function mergeDependencyFiles(
    first: Readonly<DependencyFiles>,
    second: Readonly<DependencyFiles>
): Readonly<DependencyFiles> {
    const mergedLocalFiles = new Map<string, LocalFile>();

    for (const localFile of [...first.localFiles, ...second.localFiles]) {
        mergedLocalFiles.set(localFile.filePath, localFile);
    }

    return {
        localFiles: Array.from(mergedLocalFiles.values()),
        externalDependencies: mergeExternalDependencies(first.externalDependencies, second.externalDependencies)
    };
}

type DependencyGraphVisitor = (node: Readonly<DependencyNode>) => void;

export type DependencyGraph = {
    addDependency(filePath: string, data: DependencyGraphNodeData): void;
    connect(fromFilePath: string, toFilePath: string): void;
    hasConnection(fromFilePath: string, toFilePath: string): boolean;
    walk(startFilePath: string, visitor: DependencyGraphVisitor): void;
    isKnown(filePath: string): boolean;
    flatten(startFilePath: string): Readonly<DependencyFiles>;
};

export function createDependencyGraph(): DependencyGraph {
    const graph = createDirectedGraph<string, DependencyGraphNodeData>();

    return {
        addDependency(filePath, data) {
            graph.addNode(filePath, data);
        },

        isKnown: graph.hasNode,

        connect(fromFilePath, toFilePath) {
            graph.connect({ from: fromFilePath, to: toFilePath });
        },

        hasConnection(fromFilePath, toFilePath) {
            return graph.hasConnection({ from: fromFilePath, to: toFilePath });
        },

        walk(startFilePath, visitor) {
            graph.visitBreadthFirstSearch(startFilePath, (node) => {
                visitor({
                    filePath: node.id,
                    sourceMapFilePath: node.data.sourceMapFilePath,
                    externalDependencies: node.data.externalDependencies,
                    localFiles: Array.from(node.adjacentNodeIds),
                    project: node.data.project
                });
            });
        },

        flatten(startFilePath) {
            const localFiles = new Map<string, LocalFile>();
            const externalDependencies = new Map<string, ExternalDependency>();

            graph.visitBreadthFirstSearch(startFilePath, (node) => {
                const directDependencies = new Set(graph.getAdjacentIds(node.id));

                if (node.data.sourceMapFilePath.isJust) {
                    directDependencies.add(node.data.sourceMapFilePath.value);
                    localFiles.set(node.data.sourceMapFilePath.value, {
                        filePath: node.data.sourceMapFilePath.value,
                        directDependencies: new Set(),
                        project: node.data.project.getProject()
                    });
                }

                localFiles.set(node.id, {
                    filePath: node.id,
                    directDependencies,
                    project: node.data.project.getProject()
                });

                for (const externalDependencyName of node.data.externalDependencies) {
                    const externalDependency = externalDependencies.get(externalDependencyName);
                    if (externalDependency === undefined) {
                        externalDependencies.set(externalDependencyName, {
                            name: externalDependencyName,
                            referencedFrom: [node.id]
                        });
                    } else {
                        externalDependencies.set(externalDependencyName, {
                            name: externalDependencyName,
                            referencedFrom: uniqueList([...externalDependency.referencedFrom, node.id])
                        });
                    }
                }
            });

            return {
                localFiles: Array.from(localFiles.values()),
                externalDependencies
            };
        }
    };
}
