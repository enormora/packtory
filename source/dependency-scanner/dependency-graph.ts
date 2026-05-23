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

function recordSourceMapFile(
    localFiles: Map<string, LocalFile>,
    sourceMapFilePath: Maybe<string>,
    project: TypescriptProject | undefined,
    directDependencies: Set<string>
): void {
    if (!sourceMapFilePath.isJust) {
        return;
    }

    directDependencies.add(sourceMapFilePath.value);
    localFiles.set(sourceMapFilePath.value, {
        filePath: sourceMapFilePath.value,
        directDependencies: new Set(),
        project: project?.getProject()
    });
}

function recordLocalFile(
    localFiles: Map<string, LocalFile>,
    node: {
        readonly filePath: string;
        readonly project?: TypescriptProject | undefined;
        readonly isGeneratedManifest?: true | undefined;
    },
    directDependencies: Set<string>
): void {
    localFiles.set(node.filePath, {
        filePath: node.filePath,
        directDependencies,
        project: node.project?.getProject(),
        ...(node.isGeneratedManifest ? { isGeneratedManifest: true } : {})
    });
}

function addOrUpdateExternalDependency(
    externalDependencies: Map<string, ExternalDependency>,
    externalDependencyName: string,
    reference: string
): void {
    const externalDependency = externalDependencies.get(externalDependencyName);
    if (externalDependency === undefined) {
        externalDependencies.set(externalDependencyName, {
            name: externalDependencyName,
            referencedFrom: [reference]
        });
        return;
    }

    externalDependencies.set(externalDependencyName, {
        name: externalDependencyName,
        referencedFrom: unique([...externalDependency.referencedFrom, reference])
    });
}

function recordExternalDependencies(
    externalDependencies: Map<string, ExternalDependency>,
    externalDependencyNames: readonly string[],
    reference: string
): void {
    for (const externalDependencyName of externalDependencyNames) {
        addOrUpdateExternalDependency(externalDependencies, externalDependencyName, reference);
    }
}

export function mergeDependencyFiles(
    first: Readonly<DependencyFiles>,
    second: Readonly<DependencyFiles>
): Readonly<DependencyFiles> {
    return {
        localFiles: values(
            indexBy([...first.localFiles, ...second.localFiles], (localFile) => {
                return localFile.filePath;
            })
        ),
        externalDependencies: mergeExternalDependencies(first.externalDependencies, second.externalDependencies)
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
            graph.visitBreadthFirstSearch(startFilePath, (node) => {
                visitor({
                    filePath: node.id,
                    sourceMapFilePath: node.data.sourceMapFilePath,
                    externalDependencies: node.data.externalDependencies,
                    localFiles: Array.from(node.adjacentNodeIds),
                    project: node.data.project,
                    ...(node.data.isGeneratedManifest ? { isGeneratedManifest: true } : {})
                });
            });
        },

        flatten(startFilePath) {
            const localFiles = new Map<string, LocalFile>();
            const externalDependencies = new Map<string, ExternalDependency>();

            graph.visitBreadthFirstSearch(startFilePath, (node) => {
                const directDependencies = new Set(graph.getAdjacentIds(node.id));
                recordSourceMapFile(localFiles, node.data.sourceMapFilePath, node.data.project, directDependencies);
                recordLocalFile(
                    localFiles,
                    {
                        filePath: node.id,
                        project: node.data.project,
                        isGeneratedManifest: node.data.isGeneratedManifest
                    },
                    directDependencies
                );
                recordExternalDependencies(externalDependencies, node.data.externalDependencies, node.id);
            });

            return {
                localFiles: Array.from(localFiles.values()),
                externalDependencies
            };
        }
    };
}
