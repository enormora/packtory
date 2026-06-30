import type { Maybe } from 'true-myth';
import type { Project } from 'ts-morph';
import { indexBy, unique, values } from 'remeda';
import { createDirectedGraph } from '../directed-graph/graph.ts';
import {
    mergeExternalDependencies,
    type ExternalDependencies,
    type ExternalDependency
} from './external-dependencies.ts';
import type { TypescriptProject } from './typescript-project-analyzer.ts';

export type DependencyGraphNodeData = {
    readonly sourceMapFilePath: Maybe<string>;
    readonly project?: TypescriptProject | undefined;
    readonly externalDependencies: readonly string[];
    readonly isGeneratedManifest?: true | undefined;
};

type DependencyNode = DependencyGraphNodeData & {
    readonly filePath: string;
    readonly localFiles: readonly string[];
};

export type LocalFile = {
    readonly filePath: string;
    readonly directDependencies: ReadonlySet<string>;
    readonly project?: Project | undefined;
    readonly isGeneratedManifest?: true | undefined;
};

export type DependencyFiles = {
    readonly localFiles: readonly LocalFile[];
    readonly externalDependencies: ExternalDependencies;
};

export function mergeDependencyFiles(
    first: Readonly<DependencyFiles>,
    second: Readonly<DependencyFiles>
): Readonly<DependencyFiles> {
    return {
        localFiles: values(
            indexBy([ ...first.localFiles, ...second.localFiles ], function (localFile) {
                return localFile.filePath;
            })
        ),
        externalDependencies: mergeExternalDependencies(first.externalDependencies, second.externalDependencies)
    };
}

function sourceMapLocalFile(
    sourceMapFilePath: Maybe<string>,
    project: TypescriptProject | undefined
): LocalFile | undefined {
    if (!sourceMapFilePath.isJust) {
        return undefined;
    }

    return {
        filePath: sourceMapFilePath.value,
        directDependencies: new Set(),
        project: project?.getProject()
    };
}

function mergedExternalDependency(
    externalDependency: ExternalDependency | undefined,
    externalDependencyName: string,
    reference: string
): ExternalDependency {
    if (externalDependency === undefined) {
        return {
            name: externalDependencyName,
            referencedFrom: [ reference ]
        };
    }

    return {
        name: externalDependency.name,
        referencedFrom: unique([ ...externalDependency.referencedFrom, reference ])
    };
}

type DependencyGraphVisitor = (node: Readonly<DependencyNode>) => void;

export type DependencyGraph = {
    addDependency: (filePath: string, data: DependencyGraphNodeData) => void;
    connect: (fromFilePath: string, toFilePath: string) => void;
    hasConnection: (fromFilePath: string, toFilePath: string) => boolean;
    walk: (startFilePath: string, visitor: DependencyGraphVisitor) => void;
    isKnown: (filePath: string) => boolean;
    flatten: (startFilePath: string) => Readonly<DependencyFiles>;
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
            graph.visitBreadthFirstSearch(startFilePath, function (node) {
                visitor({
                    filePath: node.id,
                    sourceMapFilePath: node.data.sourceMapFilePath,
                    externalDependencies: node.data.externalDependencies,
                    localFiles: Array.from(node.adjacentNodeIds),
                    project: node.data.project,
                    ...node.data.isGeneratedManifest && { isGeneratedManifest: true }
                });
            });
        },

        flatten(startFilePath) {
            const localFiles = new Map<string, LocalFile>();
            const externalDependencies = new Map<string, ExternalDependency>();

            graph.visitBreadthFirstSearch(startFilePath, function (node) {
                const directDependencies = new Set(graph.getAdjacentIds(node.id));
                const sourceMapFile = sourceMapLocalFile(node.data.sourceMapFilePath, node.data.project);
                if (sourceMapFile !== undefined) {
                    directDependencies.add(sourceMapFile.filePath);
                    localFiles.set(sourceMapFile.filePath, sourceMapFile);
                }
                localFiles.set(node.id, {
                    filePath: node.id,
                    directDependencies,
                    project: node.data.project?.getProject(),
                    ...node.data.isGeneratedManifest && { isGeneratedManifest: true }
                });
                for (const externalDependencyName of node.data.externalDependencies) {
                    const externalDependency = externalDependencies.get(externalDependencyName);
                    externalDependencies.set(
                        externalDependencyName,
                        mergedExternalDependency(externalDependency, externalDependencyName, node.id)
                    );
                }
            });

            return {
                localFiles: Array.from(localFiles.values()),
                externalDependencies
            };
        }
    };
}
