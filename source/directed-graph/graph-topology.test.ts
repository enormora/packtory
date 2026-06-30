import assert from 'node:assert';
import { suite, test } from 'mocha';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';
import { createDirectedGraph, type DirectedGraph } from './graph.ts';
import { collectFromGraph, createGraphWithNodes } from './graph-test-support.ts';

const probeTestTimeoutMs = 10_000;

type SimpleGraphWithReverse = {
    readonly graph: DirectedGraph<string, string>;
    readonly reversedGraph: DirectedGraph<string, string>;
};

const fourEmptyNodes: readonly (readonly [string, string])[] = [
    [ 'a', '' ],
    [ 'b', '' ],
    [ 'c', '' ],
    [ 'd', '' ]
];

suite('graph topology and traversal', function () {
    suite('topological generations', function () {
        suite('basic generations', function () {
            test('getTopologicalGenerations() throws when the graph is cyclic', function () {
                const graph = createGraphWithNodes({
                    nodes: [ [ 'a', '' ] ],
                    connections: [ { from: 'a', to: 'a' } ]
                });

                try {
                    graph.getTopologicalGenerations();
                    assert.fail('Expected getTopologicalGenerations() to fail but it did not');
                } catch (error: unknown) {
                    assert.strictEqual(
                        (error as Error).message,
                        'Failed to determine topological generations, current graph is cyclic'
                    );
                }
            });

            test('getTopologicalGenerations() returns an empty array when the graph is empty', function () {
                const graph = createDirectedGraph<string, string>();
                const generations = graph.getTopologicalGenerations();

                assert.deepStrictEqual(generations, []);
            });

            test('getTopologicalGenerations() returns one generation when there is only one node', function () {
                const graph = createGraphWithNodes({
                    nodes: [ [ 'a', '' ] ],
                    connections: []
                });

                const generations = graph.getTopologicalGenerations();

                assert.deepStrictEqual(generations, [ [ 'a' ] ]);
            });

            test('getTopologicalGenerations() returns one generation when there are multiple non-connected nodes', function () {
                const graph = createGraphWithNodes({
                    nodes: [
                        [ 'a', '' ],
                        [ 'b', '' ],
                        [ 'c', '' ]
                    ],
                    connections: []
                });

                const generations = graph.getTopologicalGenerations();

                assert.deepStrictEqual(generations, [ [ 'a', 'b', 'c' ] ]);
            });

            test('getTopologicalGenerations() returns two generations when there are two nodes which are connected', function () {
                const graph = createGraphWithNodes({
                    nodes: [
                        [ 'a', '' ],
                        [ 'b', '' ]
                    ],
                    connections: [ { from: 'a', to: 'b' } ]
                });

                const generations = graph.getTopologicalGenerations();

                assert.deepStrictEqual(generations, [ [ 'a' ], [ 'b' ] ]);
            });
        });

        suite('complex generations', function () {
            test('getTopologicalGenerations() returns two generations when there are three nodes which are connected with two roots', function () {
                const graph = createGraphWithNodes({
                    nodes: [
                        [ 'a', '' ],
                        [ 'b', '' ],
                        [ 'c', '' ]
                    ],
                    connections: [ { from: 'a', to: 'b' } ]
                });

                const generations = graph.getTopologicalGenerations();

                assert.deepStrictEqual(generations, [ [ 'a', 'c' ], [ 'b' ] ]);
            });

            test('getTopologicalGenerations() returns two generations when there are three nodes which are connected with one root', function () {
                const graph = createGraphWithNodes({
                    nodes: [
                        [ 'a', '' ],
                        [ 'b', '' ],
                        [ 'c', '' ]
                    ],
                    connections: [
                        { from: 'a', to: 'b' },
                        { from: 'a', to: 'c' }
                    ]
                });

                const generations = graph.getTopologicalGenerations();

                assert.deepStrictEqual(generations, [ [ 'a' ], [ 'b', 'c' ] ]);
            });

            test('getTopologicalGenerations() returns multiple generations of two independent paths', function () {
                const graph = createGraphWithNodes({
                    nodes: fourEmptyNodes,
                    connections: [
                        { from: 'a', to: 'b' },
                        { from: 'c', to: 'd' }
                    ]
                });

                const generations = graph.getTopologicalGenerations();

                assert.deepStrictEqual(generations, [
                    [ 'a', 'c' ],
                    [ 'b', 'd' ]
                ]);
            });

            test('getTopologicalGenerations() returns multiple generations of two dependent paths', function () {
                const graph = createGraphWithNodes({
                    nodes: [
                        [ 'a', '' ],
                        [ 'b', '' ],
                        [ 'c', '' ],
                        [ 'd', '' ],
                        [ 'e', '' ],
                        [ 'f', '' ]
                    ],
                    connections: [
                        { from: 'a', to: 'e' },
                        { from: 'e', to: 'b' },
                        { from: 'c', to: 'd' },
                        { from: 'd', to: 'e' },
                        { from: 'e', to: 'f' }
                    ]
                });

                const generations = graph.getTopologicalGenerations();

                assert.deepStrictEqual(generations, [ [ 'a', 'c' ], [ 'd' ], [ 'e' ], [ 'b', 'f' ] ]);
            });

            test('getTopologicalGenerations() keeps a shared dependency in a later generation until all incoming edges are consumed', function () {
                const graph = createGraphWithNodes({
                    nodes: fourEmptyNodes,
                    connections: [
                        { from: 'a', to: 'c' },
                        { from: 'b', to: 'c' },
                        { from: 'c', to: 'd' }
                    ]
                });

                const generations = graph.getTopologicalGenerations();

                assert.deepStrictEqual(generations, [ [ 'a', 'b' ], [ 'c' ], [ 'd' ] ]);
            });

            test('disconnect() updates incoming-edge counts used by topological generations', function () {
                const graph = createGraphWithNodes({
                    nodes: [
                        [ 'a', '' ],
                        [ 'b', '' ],
                        [ 'c', '' ]
                    ],
                    connections: [
                        { from: 'a', to: 'c' },
                        { from: 'b', to: 'c' }
                    ]
                });

                graph.disconnect({ from: 'b', to: 'c' });

                assert.deepStrictEqual(graph.getTopologicalGenerations(), [ [ 'a', 'b' ], [ 'c' ] ]);

                graph.disconnect({ from: 'a', to: 'c' });

                assert.deepStrictEqual(graph.getTopologicalGenerations(), [ [ 'a', 'b', 'c' ] ]);
            });
        });
    });

    suite('traversal', function () {
        test('traverse() visits each reachable node once across disconnected roots', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', 'first' ],
                    [ 'b', 'second' ],
                    [ 'c', 'third' ],
                    [ 'd', 'fourth' ],
                    [ 'e', 'fifth' ]
                ],
                connections: [
                    { from: 'a', to: 'b' },
                    { from: 'b', to: 'c' },
                    { from: 'd', to: 'e' }
                ]
            });
            const visited: string[] = [];

            graph.traverse(function (node) {
                visited.push(`${node.id}:${node.incomingEdges}`);
            });

            assert.deepStrictEqual(visited, [ 'a:0', 'b:1', 'c:1', 'd:0', 'e:1' ]);
        });

        test('visitBreadthFirstSearch() visits shared descendants only once', function () {
            const graph = createGraphWithNodes({
                nodes: fourEmptyNodes,
                connections: [
                    { from: 'a', to: 'b' },
                    { from: 'a', to: 'c' },
                    { from: 'b', to: 'd' },
                    { from: 'c', to: 'd' }
                ]
            });

            assert.deepStrictEqual(collectFromGraph(graph, 'a'), [ 'a', 'b', 'c', 'd' ]);
        });
    });

    suite('reverse and adjacency', function () {
        function buildSimpleAToBGraphWithReverse(): SimpleGraphWithReverse {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ]
                ],
                connections: [ { from: 'a', to: 'b' } ]
            });
            return { graph, reversedGraph: graph.reverse() };
        }

        test('reverse() returns a new graph with the edges reversed', function () {
            const { graph, reversedGraph } = buildSimpleAToBGraphWithReverse();

            assert.strictEqual(graph.hasConnection({ from: 'a', to: 'b' }), true);
            assert.strictEqual(graph.hasConnection({ from: 'b', to: 'a' }), false);
            assert.strictEqual(reversedGraph.hasConnection({ from: 'a', to: 'b' }), false);
            assert.strictEqual(reversedGraph.hasConnection({ from: 'b', to: 'a' }), true);
        });

        test('reverse() copies all nodes with their data', function () {
            const { reversedGraph } = buildSimpleAToBGraphWithReverse();
            const collectedNodes: unknown[] = [];

            reversedGraph.visitBreadthFirstSearch('b', function (node) {
                collectedNodes.push(node);
            });

            assert.deepStrictEqual(collectedNodes, [
                {
                    id: 'b',
                    data: 'bar',
                    adjacentNodeIds: new Set([ 'a' ]),
                    incomingEdges: 0
                },
                {
                    id: 'a',
                    data: 'foo',
                    adjacentNodeIds: new Set(),
                    incomingEdges: 1
                }
            ]);
        });

        test('getAdjacentIds() returns an empty Set if the requested node doesn’t have any connections', function () {
            const graph = createGraphWithNodes({
                nodes: [ [ 'a', '' ] ],
                connections: []
            });

            const adjacentIds = graph.getAdjacentIds('a');

            assert.deepStrictEqual(Array.from(adjacentIds), []);
        });

        test('getAdjacentIds() returns all connected ids for the requested node', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', '' ],
                    [ 'b', '' ],
                    [ 'c', '' ],
                    [ 'd', '' ],
                    [ 'f', '' ]
                ],
                connections: [
                    { from: 'a', to: 'b' },
                    { from: 'a', to: 'c' },
                    { from: 'a', to: 'd' },
                    { from: 'b', to: 'f' }
                ]
            });

            const adjacentIds = graph.getAdjacentIds('a');

            assert.deepStrictEqual(Array.from(adjacentIds), [ 'b', 'c', 'd' ]);
        });

        test('getAdjacentIds() throws when the requested node doesn’t exist', function () {
            const graph = createGraphWithNodes({
                nodes: [],
                connections: []
            });

            try {
                graph.getAdjacentIds('a');
                assert.fail('Expected getAdjacentIds() to fail but it did not');
            } catch (error: unknown) {
                assert.strictEqual((error as Error).message, 'Node with id "a" does not exist');
            }
        });
    });

    suite('probe guards', function () {
        test('detectCycles() completes promptly for self-referential graphs', async function () {
            const result = await runNodeProbe(
                `
                import { createDirectedGraph } from './source/directed-graph/graph.ts';

                const graph = createDirectedGraph();
                graph.addNode('a', 'value');
                graph.connect({ from: 'a', to: 'a' });

                console.log(JSON.stringify(graph.detectCycles()));
            `,
                { timeoutMs: 3000 }
            );

            assert.deepStrictEqual(result, [ [ 'a', 'a' ] ]);
        })
            .timeout(probeTestTimeoutMs);

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
                    visited.push(node.id);
                });

                console.log(JSON.stringify(visited));
            `,
                { timeoutMs: 3000 }
            );

            assert.deepStrictEqual(result, [ 'a', 'b' ]);
        })
            .timeout(probeTestTimeoutMs);

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
                { timeoutMs: 3000 }
            );

            assert.deepStrictEqual(result, [ [ 'a' ], [ 'b' ] ]);
        })
            .timeout(probeTestTimeoutMs);

        test('detectCycles() throws when cycle traversal exceeds the maximum depth', function () {
            const graph = createDirectedGraph<string, string>({
                cyclePathIncludes() {
                    return false;
                }
            });
            graph.addNode('a', 'value');
            graph.connect({ from: 'a', to: 'a' });

            assert.throws(function () {
                graph.detectCycles();
            }, /^Error: Cycle detection exceeded the maximum traversal depth$/u);
        });

        test('getTopologicalGenerations() throws when generation discovery stops making progress', function () {
            const graph = createDirectedGraph<string, string>({
                mergeDiscovered(_alreadyDiscovered, currentGeneration) {
                    return new Set(
                        currentGeneration.filter(function (id) {
                            return id !== 'a';
                        })
                    );
                }
            });
            graph.addNode('a', 'first');
            graph.addNode('b', 'second');
            graph.connect({ from: 'a', to: 'b' });

            assert.throws(function () {
                graph.getTopologicalGenerations();
            }, /^Error: Topological generation discovery did not make progress after 3 attempts$/u);
        });

        test('visitBreadthFirstSearch() throws when traversal exceeds the iteration budget', function () {
            const graph = createDirectedGraph<string, string>({
                visitedHas(visited, id) {
                    if (id === 'a' || id === 'b') {
                        return false;
                    }
                    return visited.has(id);
                }
            });
            graph.addNode('a', 'first');
            graph.addNode('b', 'second');
            graph.connect({ from: 'a', to: 'b' });
            graph.connect({ from: 'b', to: 'a' });
            let visitorCallCount = 0;
            const countVisit = function (): void {
                visitorCallCount += 1;
            };

            assert.throws(function () {
                graph.visitBreadthFirstSearch('a', countVisit);
            }, /^Error: Breadth-first traversal exceeded the maximum iteration budget$/u);
            assert.strictEqual(visitorCallCount, 5);
        });
    });
});
