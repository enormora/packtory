import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Maybe } from 'true-myth';
import { type SinonSpy, fake } from 'sinon';
import {
    createDependencyGraph,
    type DependencyFiles,
    type DependencyGraph,
    type DependencyGraphNodeData,
    mergeDependencyFiles
} from './dependency-graph.ts';

type DependencyNode = Parameters<Parameters<DependencyGraph['walk']>[1]>[0];

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

suite('dependency-graph', function () {
    test('isKnown() returns false when the given file hasn’t been added', function () {
        const graph = createDependencyGraph();
        assert.strictEqual(graph.isKnown('foo.js'), false);
    });

    test('isKnown() returns true when the given file has been added', function () {
        const graph = createDependencyGraph();

        graph.addDependency('foo.js', dependencyGraphNodeDataFactory());

        assert.strictEqual(graph.isKnown('foo.js'), true);
    });

    test('hasConnection() returns false when the given files are not connected', function () {
        const graph = createDependencyGraph();

        graph.addDependency('foo.js', dependencyGraphNodeDataFactory());
        graph.addDependency('bar.js', dependencyGraphNodeDataFactory());

        assert.strictEqual(graph.hasConnection('foo.js', 'bar.js'), false);
    });

    test('hasConnection() returns true when the given files are connected', function () {
        const graph = createDependencyGraph();

        graph.addDependency('foo.js', dependencyGraphNodeDataFactory());
        graph.addDependency('bar.js', dependencyGraphNodeDataFactory());
        graph.connect('foo.js', 'bar.js');

        assert.strictEqual(graph.hasConnection('foo.js', 'bar.js'), true);
    });

    function collectVisitorNodes(graph: DependencyGraph, startFilePath: string): readonly DependencyNode[] {
        const collected: DependencyNode[] = [];

        graph.walk(startFilePath, (node) => {
            collected.push(node);
        });

        return collected;
    }

    test('walk() visits the start node only if it has no connections', function () {
        const graph = createDependencyGraph();
        const getProject = fake.returns({});

        graph.addDependency('foo.js', dependencyGraphNodeDataFactory({ getProject }));
        const result = collectVisitorNodes(graph, 'foo.js');

        assert.deepStrictEqual(result, [
            {
                filePath: 'foo.js',
                sourceMapFilePath: Maybe.nothing(),
                externalDependencies: [],
                localFiles: [],
                project: { getProject }
            }
        ]);
    });

    test('walk() visits the start node and all its connections', function () {
        const graph = createDependencyGraph();
        const getProject = fake.returns({});

        graph.addDependency('foo.js', dependencyGraphNodeDataFactory({ getProject }));
        graph.addDependency('bar.js', dependencyGraphNodeDataFactory({ getProject }));
        graph.addDependency('baz.js', dependencyGraphNodeDataFactory({ getProject }));
        graph.connect('foo.js', 'bar.js');
        graph.connect('bar.js', 'baz.js');

        const result = collectVisitorNodes(graph, 'foo.js');

        assert.deepStrictEqual(result, [
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

    test('walk() preserves generated-manifest markers', function () {
        const graph = createDependencyGraph();

        graph.addDependency('package.json', {
            sourceMapFilePath: Maybe.nothing(),
            externalDependencies: [],
            isGeneratedManifest: true
        });

        const result = collectVisitorNodes(graph, 'package.json');

        assert.deepStrictEqual(result, [
            {
                filePath: 'package.json',
                sourceMapFilePath: Maybe.nothing(),
                externalDependencies: [],
                localFiles: [],
                project: undefined,
                isGeneratedManifest: true
            }
        ]);
    });

    const fooBarLocalFiles = [
        { directDependencies: new Set(['bar.js']), filePath: 'foo.js', project: {} },
        { directDependencies: new Set(), filePath: 'bar.js', project: {} }
    ];

    test('flatten() collects all nodes and returns a single list for all local files', function () {
        const graph = createDependencyGraph();

        graph.addDependency('foo.js', dependencyGraphNodeDataFactory());
        graph.addDependency('bar.js', dependencyGraphNodeDataFactory());
        graph.connect('foo.js', 'bar.js');
        const result = graph.flatten('foo.js');

        assert.deepStrictEqual(result, {
            localFiles: fooBarLocalFiles,
            externalDependencies: new Map()
        });
    });

    test('flatten() collects all nodes and returns a single map for topLevelDependencies eliminating duplicates', function () {
        const graph = createDependencyGraph();

        graph.addDependency('foo.js', dependencyGraphNodeDataFactory({ topLevelDependencies: ['a', 'b'] }));
        graph.addDependency('bar.js', dependencyGraphNodeDataFactory({ topLevelDependencies: ['b', 'c'] }));
        graph.connect('foo.js', 'bar.js');
        const result = graph.flatten('foo.js');

        assert.deepStrictEqual(result, {
            localFiles: fooBarLocalFiles,
            externalDependencies: new Map([
                ['a', { name: 'a', referencedFrom: ['foo.js'] }],
                ['b', { name: 'b', referencedFrom: ['foo.js', 'bar.js'] }],
                ['c', { name: 'c', referencedFrom: ['bar.js'] }]
            ])
        });
    });

    test('flatten() keeps source map files projectless when the owning node has no project', function () {
        const graph = createDependencyGraph();

        graph.addDependency('foo.js', {
            sourceMapFilePath: Maybe.just('foo.js.map'),
            externalDependencies: []
        });

        const result = graph.flatten('foo.js');

        assert.deepStrictEqual(result.localFiles, [
            { directDependencies: new Set(), filePath: 'foo.js.map', project: undefined },
            { directDependencies: new Set(['foo.js.map']), filePath: 'foo.js', project: undefined }
        ]);
    });

    test('mergeDependencyFiles() merges two sets of dependency files', function () {
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

        assert.deepStrictEqual(result, {
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
});
