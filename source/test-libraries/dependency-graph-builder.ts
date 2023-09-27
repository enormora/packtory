import { Maybe } from 'true-myth';
import type { Project } from 'ts-morph';
import { type DependencyGraph, createDependencyGraph } from '../dependency-scanner/dependency-graph.js';
import { createProject } from './typescript-project.js';

type Entry = {
    readonly filePath: string;
    readonly content: string;
    readonly topLevelDependencies?: Map<string, string>;
    readonly dependencies?: Entry[];
};

type Options = {
    readonly entries?: Entry[];
};

function addEntries(
    graph: DependencyGraph,
    project: Project,
    entries: readonly Entry[],
    parentFilePath: string | null
): void {
    for (const entry of entries) {
        const sourceFile = project.createSourceFile(entry.filePath, entry.content);
        graph.addDependency(entry.filePath, {
            sourceMapFilePath: Maybe.nothing(),
            topLevelDependencies: entry.topLevelDependencies ?? new Map<string, string>(),
            substitutionContent: Maybe.nothing(),
            tsSourceFile: sourceFile
        });
        if (parentFilePath !== null) {
            graph.connect(parentFilePath, entry.filePath);
        }

        if (Array.isArray(entry.dependencies)) {
            addEntries(graph, project, entry.dependencies, entry.filePath);
        }
    }
}

export function buildDependencyGraph(options: Options = {}): DependencyGraph {
    const { entries = [] } = options;
    const graph = createDependencyGraph();
    const project = createProject();

    addEntries(graph, project, entries, null);

    return graph;
}
