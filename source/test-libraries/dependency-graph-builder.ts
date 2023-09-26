import { Maybe } from 'true-myth';
import { Project } from 'ts-morph';
import { DependencyGraph, createDependencyGraph } from '../dependency-scanner/dependency-graph.js';
import { createProject } from './typescript-project.js';

interface Entry {
    filePath: string;
    content: string;
    topLevelDependencies?: Map<string, string>;
    dependencies?: Entry[];
}

interface Options {
    entries?: Entry[];
}

function addEntries(graph: DependencyGraph, project: Project, entries: Entry[], parentFilePath: string | null): void {
    for (const entry of entries) {
        const sourceFile = project.createSourceFile(entry.filePath, entry.content);
        graph.addDependency(entry.filePath, {
            sourceMapFilePath: Maybe.nothing(),
            topLevelDependencies: entry.topLevelDependencies ?? new Map(),
            substitutionContent: Maybe.nothing(),
            tsSourceFile: sourceFile,
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
