import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createDirectedGraph, type DirectedGraph } from '../directed-graph/graph.ts';
import type { PackageConfiguration } from './configuration.ts';
import { validateCyclicDependencies, validateDuplicatePackages } from './cross-package-validation.ts';

function packageConfiguration(name: string): PackageConfiguration {
    return { name, roots: { main: { javaScript: 'index.js' } }, sourcesFolder: 'source' };
}

suite('cross-package-validation', function () {
    test('validateDuplicatePackages returns no issues when every package has a unique name', function () {
        assert.deepStrictEqual(validateDuplicatePackages([ packageConfiguration('a'), packageConfiguration('b') ]), []);
    });

    test('validateDuplicatePackages reports each duplicated package name once', function () {
        assert.deepStrictEqual(
            validateDuplicatePackages([
                packageConfiguration('a'),
                packageConfiguration('a'),
                packageConfiguration('b')
            ]),
            [ 'Duplicate package definition with the name "a"' ]
        );
    });

    type TestEdge = {
        readonly from: string;
        readonly to: string;
    };

    function graphWithEdges(...edges: readonly TestEdge[]): DirectedGraph<string, undefined> {
        const graph = createDirectedGraph<string, undefined>();
        const nodes = new Set<string>();
        for (const edge of edges) {
            nodes.add(edge.from);
            nodes.add(edge.to);
        }
        for (const identifier of nodes) {
            graph.addNode(identifier, undefined);
        }
        for (const edge of edges) {
            graph.connect(edge);
        }
        return graph;
    }

    test('validateCyclicDependencies returns no issues for an acyclic graph', function () {
        assert.deepStrictEqual(validateCyclicDependencies(graphWithEdges({ from: 'a', to: 'b' })), []);
    });

    test('validateCyclicDependencies reports the cycle path joined with arrows', function () {
        assert.deepStrictEqual(
            validateCyclicDependencies(graphWithEdges({ from: 'a', to: 'b' }, { from: 'b', to: 'a' })),
            [ 'Unexpected cyclic dependency path: [a→b→a]' ]
        );
    });
});
