import test from 'ava';
import {
    createDependencyGraph,
    DependencyFiles,
    DependencyGraph,
    DependencyGraphNodeData,
    DependencyNode,
    mergeDependencyFiles,
} from './dependency-graph.js';
import { Maybe } from 'true-myth';
import { SourceFile } from 'ts-morph';

interface Overrides {
    topLevelDependencies?: [string, string][];
}
function dependencyGraphNodeDataFactory(overrides: Overrides = {}): DependencyGraphNodeData {
    const { topLevelDependencies = [] } = overrides;

    return {
        sourceMapFilePath: Maybe.nothing(),
        topLevelDependencies: new Map(topLevelDependencies),
        substitutionContent: Maybe.nothing(),
        tsSourceFile: {} as unknown as SourceFile,
    };
}

test('isKnown() returns false when the given file hasn’t been added', (t) => {
    const graph = createDependencyGraph();
    t.is(graph.isKnown('foo.js'), false);
});

test('isKnown() returns true when the given file has been added', (t) => {
    const graph = createDependencyGraph();

    graph.addDependency('foo.js', dependencyGraphNodeDataFactory());

    t.is(graph.isKnown('foo.js'), true);
});

test('hasConnection() returns false when the given files are not connected', (t) => {
    const graph = createDependencyGraph();

    graph.addDependency('foo.js', dependencyGraphNodeDataFactory());
    graph.addDependency('bar.js', dependencyGraphNodeDataFactory());

    t.is(graph.hasConnection('foo.js', 'bar.js'), false);
});

test('hasConnection() returns true when the given files are connected', (t) => {
    const graph = createDependencyGraph();

    graph.addDependency('foo.js', dependencyGraphNodeDataFactory());
    graph.addDependency('bar.js', dependencyGraphNodeDataFactory());
    graph.connect('foo.js', 'bar.js');

    t.is(graph.hasConnection('foo.js', 'bar.js'), true);
});

function collectVisitorNodes(graph: DependencyGraph, startFilePath: string): DependencyNode[] {
    const collected: DependencyNode[] = [];

    graph.walk(startFilePath, (node) => {
        collected.push(node);
    });

    return collected;
}

test('walk() visits the start node only if it has no connections', (t) => {
    const graph = createDependencyGraph();

    graph.addDependency('foo.js', dependencyGraphNodeDataFactory());
    const result = collectVisitorNodes(graph, 'foo.js');

    t.deepEqual(result, [
        {
            filePath: 'foo.js',
            sourceMapFilePath: Maybe.nothing(),
            topLevelDependencies: new Map(),
            localFiles: [],
            substitutionContent: Maybe.nothing(),
            tsSourceFile: {},
        },
    ]);
});

test('walk() visits the start node and all its connections', (t) => {
    const graph = createDependencyGraph();

    graph.addDependency('foo.js', dependencyGraphNodeDataFactory());
    graph.addDependency('bar.js', dependencyGraphNodeDataFactory());
    graph.addDependency('baz.js', dependencyGraphNodeDataFactory());
    graph.connect('foo.js', 'bar.js');
    graph.connect('bar.js', 'baz.js');

    const result = collectVisitorNodes(graph, 'foo.js');

    t.deepEqual(result, [
        {
            filePath: 'foo.js',
            sourceMapFilePath: Maybe.nothing(),
            topLevelDependencies: new Map(),
            localFiles: ['bar.js'],
            substitutionContent: Maybe.nothing(),
            tsSourceFile: {},
        },
        {
            filePath: 'bar.js',
            sourceMapFilePath: Maybe.nothing(),
            topLevelDependencies: new Map(),
            localFiles: ['baz.js'],
            substitutionContent: Maybe.nothing(),
            tsSourceFile: {},
        },
        {
            filePath: 'baz.js',
            sourceMapFilePath: Maybe.nothing(),
            topLevelDependencies: new Map(),
            localFiles: [],
            substitutionContent: Maybe.nothing(),
            tsSourceFile: {},
        },
    ]);
});

test('flatten() collects all nodes and returns a single list for all local files', (t) => {
    const graph = createDependencyGraph();

    graph.addDependency('foo.js', dependencyGraphNodeDataFactory());
    graph.addDependency('bar.js', dependencyGraphNodeDataFactory());
    graph.connect('foo.js', 'bar.js');
    const result = graph.flatten('foo.js');

    t.deepEqual(result, {
        localFiles: [
            { filePath: 'foo.js', substitutionContent: Maybe.nothing() },
            { filePath: 'bar.js', substitutionContent: Maybe.nothing() },
        ],
        topLevelDependencies: {},
    });
});

test('flatten() collects all nodes and returns a single map for topLevelDependencies eliminating duplicates', (t) => {
    const graph = createDependencyGraph();

    graph.addDependency(
        'foo.js',
        dependencyGraphNodeDataFactory({
            topLevelDependencies: [
                ['a', '1.2.3'],
                ['b', '42.0.0'],
            ],
        }),
    );
    graph.addDependency(
        'bar.js',
        dependencyGraphNodeDataFactory({
            topLevelDependencies: [
                ['b', '21.0.0'],
                ['c', '0.0.0'],
            ],
        }),
    );
    graph.connect('foo.js', 'bar.js');
    const result = graph.flatten('foo.js');

    t.deepEqual(result, {
        localFiles: [
            { filePath: 'foo.js', substitutionContent: Maybe.nothing() },
            { filePath: 'bar.js', substitutionContent: Maybe.nothing() },
        ],
        topLevelDependencies: {
            a: '1.2.3',
            b: '21.0.0',
            c: '0.0.0',
        },
    });
});

test('mergeDependencyFiles() merges two sets of dependency files', (t) => {
    const firstSet: DependencyFiles = {
        localFiles: [
            { filePath: 'foo.js', substitutionContent: Maybe.nothing() },
            { filePath: 'bar.js', substitutionContent: Maybe.nothing() },
        ],
        topLevelDependencies: { a: '1', b: '2' },
    };
    const secondSet: DependencyFiles = {
        localFiles: [
            { filePath: 'bar.js', substitutionContent: Maybe.nothing() },
            { filePath: 'baz.js', substitutionContent: Maybe.nothing() },
        ],
        topLevelDependencies: { b: '3', c: '4' },
    };
    const result = mergeDependencyFiles(firstSet, secondSet);

    t.deepEqual(result, {
        localFiles: [
            { filePath: 'foo.js', substitutionContent: Maybe.nothing() },
            { filePath: 'bar.js', substitutionContent: Maybe.nothing() },
            { filePath: 'baz.js', substitutionContent: Maybe.nothing() },
        ],
        topLevelDependencies: { a: '1', b: '3', c: '4' },
    });
});
