import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createDirectedGraph } from '../directed-graph/graph.ts';
import type { PackageConfig } from './config.ts';
import { validateCyclicDependencies, validateDuplicatePackages } from './cross-package-validation.ts';

function packageConfig(name: string): PackageConfig {
    return { name, roots: { main: { js: 'index.js' } }, sourcesFolder: 'src' } as unknown as PackageConfig;
}

suite('cross-package-validation', function () {
    test('validateDuplicatePackages returns no issues when every package has a unique name', function () {
        assert.deepStrictEqual(validateDuplicatePackages([packageConfig('a'), packageConfig('b')]), []);
    });

    test('validateDuplicatePackages reports each duplicated package name once', function () {
        assert.deepStrictEqual(
            validateDuplicatePackages([packageConfig('a'), packageConfig('a'), packageConfig('b')]),
            ['Duplicate package definition with the name "a"']
        );
    });

    function graphWithEdges(...edges: readonly { readonly from: string; readonly to: string }[]) {
        const graph = createDirectedGraph<string, undefined>();
        const nodes = new Set<string>();
        for (const edge of edges) {
            nodes.add(edge.from);
            nodes.add(edge.to);
        }
        for (const id of nodes) {
            graph.addNode(id, undefined);
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
            ['Unexpected cyclic dependency path: [a→b→a]']
        );
    });
});
