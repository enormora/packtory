import test from 'ava';
import { Maybe } from 'true-myth';
import { type SinonSpy, fake } from 'sinon';
import {
    createDependencyGraph,
    type DependencyFiles,
    type DependencyGraph,
    type DependencyGraphNodeData,
    type DependencyNode,
    mergeDependencyFiles
} from './dependency-graph.ts';

type Overrides = {
    readonly topLevelDependencies?: string[];
    readonly getProject?: SinonSpy;
};
function dependencyGraphNodeDataFactory(overrides: Overrides = {}): DependencyGraphNodeData {
    const { topLevelDependencies = [], getProject = fake.returns({}) } = overrides;

    return {
        sourceMapFilePath: Maybe.nothing(),
        externalDependencies: topLevelDependencies,
        project: {
            getProject
        }
    } as unknown as DependencyGraphNodeData;
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

function collectVisitorNodes(graph: DependencyGraph, startFilePath: string): readonly DependencyNode[] {
    const collected: DependencyNode[] = [];

    graph.walk(startFilePath, (node) => {
        collected.push(node);
    });

    return collected;
}

test('walk() visits the start node only if it has no connections', (t) => {
    const graph = createDependencyGraph();
    const getProject = fake.returns({});

    graph.addDependency('foo.js', dependencyGraphNodeDataFactory({ getProject }));
    const result = collectVisitorNodes(graph, 'foo.js');

    t.deepEqual(result, [
        {
            filePath: 'foo.js',
            sourceMapFilePath: Maybe.nothing(),
            externalDependencies: [],
            localFiles: [],
            project: { getProject }
        }
    ]);
});

test('walk() visits the start node and all its connections', (t) => {
    const graph = createDependencyGraph();
    const getProject = fake.returns({});

    graph.addDependency('foo.js', dependencyGraphNodeDataFactory({ getProject }));
    graph.addDependency('bar.js', dependencyGraphNodeDataFactory({ getProject }));
    graph.addDependency('baz.js', dependencyGraphNodeDataFactory({ getProject }));
    graph.connect('foo.js', 'bar.js');
    graph.connect('bar.js', 'baz.js');

    const result = collectVisitorNodes(graph, 'foo.js');

    t.deepEqual(result, [
        {
            filePath: 'foo.js',
            sourceMapFilePath: Maybe.nothing(),
            externalDependencies: [],
            localFiles: ['bar.js'],
            project: { getProject }
        },
        {
            filePath: 'bar.js',
            sourceMapFilePath: Maybe.nothing(),
            externalDependencies: [],
            localFiles: ['baz.js'],
            project: { getProject }
        },
        {
            filePath: 'baz.js',
            sourceMapFilePath: Maybe.nothing(),
            externalDependencies: [],
            localFiles: [],
            project: { getProject }
        }
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
            { directDependencies: new Set(['bar.js']), filePath: 'foo.js', project: {} },
            { directDependencies: new Set(), filePath: 'bar.js', project: {} }
        ],
        externalDependencies: new Map()
    });
});

test('flatten() collects all nodes and returns a single map for topLevelDependencies eliminating duplicates', (t) => {
    const graph = createDependencyGraph();

    graph.addDependency(
        'foo.js',
        dependencyGraphNodeDataFactory({
            topLevelDependencies: ['a', 'b']
        })
    );
    graph.addDependency(
        'bar.js',
        dependencyGraphNodeDataFactory({
            topLevelDependencies: ['b', 'c']
        })
    );
    graph.connect('foo.js', 'bar.js');
    const result = graph.flatten('foo.js');

    t.deepEqual(result, {
        localFiles: [
            { directDependencies: new Set(['bar.js']), filePath: 'foo.js', project: {} },
            { directDependencies: new Set([]), filePath: 'bar.js', project: {} }
        ],
        externalDependencies: new Map([
            ['a', { name: 'a', referencedFrom: ['foo.js'] }],
            ['b', { name: 'b', referencedFrom: ['foo.js', 'bar.js'] }],
            ['c', { name: 'c', referencedFrom: ['bar.js'] }]
        ])
    });
});

test('mergeDependencyFiles() merges two sets of dependency files', (t) => {
    const firstSet: DependencyFiles = {
        localFiles: [
            { filePath: 'foo.js', directDependencies: new Set() },
            { filePath: 'bar.js', directDependencies: new Set() }
        ],
        externalDependencies: new Map([
            ['a', { name: 'a', referencedFrom: ['foo.js'] }],
            ['b', { name: 'b', referencedFrom: ['foo.js'] }]
        ])
    };
    const secondSet: DependencyFiles = {
        localFiles: [
            { filePath: 'bar.js', directDependencies: new Set() },
            { filePath: 'baz.js', directDependencies: new Set() }
        ],
        externalDependencies: new Map([
            ['b', { name: 'b', referencedFrom: ['baz.js'] }],
            ['d', { name: 'c', referencedFrom: ['baz.js'] }]
        ])
    };
    const result = mergeDependencyFiles(firstSet, secondSet);

    t.deepEqual(result, {
        localFiles: [
            { filePath: 'foo.js', directDependencies: new Set() },
            { filePath: 'bar.js', directDependencies: new Set() },
            { filePath: 'baz.js', directDependencies: new Set() }
        ],
        externalDependencies: new Map([
            ['a', { name: 'a', referencedFrom: ['foo.js'] }],
            ['b', { name: 'b', referencedFrom: ['foo.js', 'baz.js'] }],
            ['c', { name: 'c', referencedFrom: ['baz.js'] }]
        ])
    });
});
