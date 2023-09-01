import {Maybe} from "true-myth";
import {SourceFile} from "ts-morph";
import {createDirectedGraph} from '../directed-graph/graph.js';

export interface DependencyGraphNodeData {
    readonly sourceMapFilePath: Maybe<string>;
    readonly topLevelDependencies: Map<string, string>;
    readonly substitutionContent: Maybe<string>;
    readonly tsSourceFile: SourceFile;
}

export interface DependencyNode extends DependencyGraphNodeData {
    filePath: string;
    readonly localFiles: readonly string[];
}

export interface LocalFile {
    filePath: string;
    substitutionContent: Maybe<string>;
}

export interface DependencyFiles {
    localFiles: readonly LocalFile[];
    topLevelDependencies: Record<string, string>;
}

export function mergeDependencyFiles(first: DependencyFiles, second: DependencyFiles): DependencyFiles {
    const mergedLocalFiles = new Map<string, LocalFile>();

    for (const localFile of [ ...first.localFiles, ...second.localFiles ]) {
        mergedLocalFiles.set(localFile.filePath, localFile);
    }

    return {
        localFiles: Array.from(mergedLocalFiles.values()),
        topLevelDependencies: {...first.topLevelDependencies, ...second.topLevelDependencies}
    };
}

type DependencyGraphVisitor = (node: DependencyNode) => void;

export interface DependencyGraph {
    addDependency(filePath: string, data: DependencyGraphNodeData): void;
    connect(fromFilePath: string, toFilePath: string): void;
    hasConnection(fromFilePath: string, toFilePath: string): boolean;
    walk(startFilePath: string, visitor: DependencyGraphVisitor): void;
    isKnown(filePath: string): boolean;
    flatten(startFilePath: string): DependencyFiles;
}

export function createDependencyGraph(): DependencyGraph {
    const graph = createDirectedGraph<string, DependencyGraphNodeData>();

    return {
        addDependency(filePath, data) {
            graph.addNode(filePath, data);
        },

        isKnown: graph.hasNode,

        connect(fromFilePath, toFilePath) {
            graph.connect({from: fromFilePath, to: toFilePath});
        },

        hasConnection(fromFilePath, toFilePath) {
            return graph.hasConnection({from: fromFilePath, to: toFilePath});
        },

        walk(startFilePath, visitor) {
            graph.visitBreadthFirstSearch(startFilePath, (node) => {
                visitor({
                    filePath: node.id,
                    sourceMapFilePath: node.data.sourceMapFilePath,
                    topLevelDependencies: node.data.topLevelDependencies,
                    localFiles: Array.from(node.adjacentNodeIds),
                    substitutionContent: node.data.substitutionContent,
                    tsSourceFile: node.data.tsSourceFile
                });
            });
        },

        flatten(startFilePath) {
            const localFiles = new Map<string, LocalFile>();
            const topLevelDependencies = new Map<string, string>();

            graph.visitBreadthFirstSearch(startFilePath, (node) => {
                localFiles.set(node.id, {filePath: node.id, substitutionContent: node.data.substitutionContent});
                if (node.data.sourceMapFilePath.isJust) {
                    localFiles.set(node.data.sourceMapFilePath.value, {filePath: node.data.sourceMapFilePath.value, substitutionContent: Maybe.nothing()});
                }

                for (const [ name, version ] of node.data.topLevelDependencies.entries()) {
                    topLevelDependencies.set(name, version);
                }
            });

            return {
                localFiles: Array.from(localFiles.values()),
                topLevelDependencies: Object.fromEntries(topLevelDependencies.entries())
            };
        }
    };
}
