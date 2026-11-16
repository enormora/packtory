import assert from 'node:assert';
import { suite, test } from 'mocha';
import { runNodeProbe } from '../../source/test-libraries/run-node-probe.ts';

const graphProbeTimeoutMilliseconds = 3000;

suite('graph termination', function () {
    test('detectCycles() completes promptly for self-referential graphs', async function () {
        const result = await runNodeProbe(
            `
                import { createDirectedGraph } from './source/directed-graph/graph.ts';

                const graph = createDirectedGraph();
                graph.addNode('a', 'value');
                graph.connect({ from: 'a', to: 'a' });

                console.log(JSON.stringify(graph.detectCycles()));
            `,
            { timeoutMilliseconds: graphProbeTimeoutMilliseconds }
        );

        assert.deepStrictEqual(result, [ [ 'a', 'a' ] ]);
    });

    test('visitBreadthFirstSearch() completes promptly for cyclic graphs', async function () {
        const result = await runNodeProbe(
            `
                import { createDirectedGraph } from './source/directed-graph/graph.ts';

                const graph = createDirectedGraph();
                graph.addNode('a', 'first');
                graph.addNode('b', 'second');
                graph.connect({ from: 'a', to: 'b' });
                graph.connect({ from: 'b', to: 'a' });

                const visited = [];
                graph.visitBreadthFirstSearch('a', (node) => {
                    visited.push(node.identifier);
                });

                console.log(JSON.stringify(visited));
            `,
            { timeoutMilliseconds: graphProbeTimeoutMilliseconds }
        );

        assert.deepStrictEqual(result, [ 'a', 'b' ]);
    });

    test('getTopologicalGenerations() completes promptly for acyclic graphs', async function () {
        const result = await runNodeProbe(
            `
                import { createDirectedGraph } from './source/directed-graph/graph.ts';

                const graph = createDirectedGraph();
                graph.addNode('a', 'first');
                graph.addNode('b', 'second');
                graph.connect({ from: 'a', to: 'b' });

                console.log(JSON.stringify(graph.getTopologicalGenerations()));
            `,
            { timeoutMilliseconds: graphProbeTimeoutMilliseconds }
        );

        assert.deepStrictEqual(result, [ [ 'a' ], [ 'b' ] ]);
    });
});
