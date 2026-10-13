import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';
import { createDirectedGraph, type DirectedGraph } from './graph.ts';

const graphProbeTimeoutMilliseconds = 3000;

type GraphEdge<TIdentifier extends number | string> = Parameters<DirectedGraph<TIdentifier, unknown>['connect']>[0];

type GraphShape = {
    readonly nodeIdentifiers: readonly string[];
    readonly edges: readonly GraphEdge<string>[];
};

function nodeIdentifierAt(nodeIdentifiers: readonly string[], index: number): string {
    const nodeIdentifier = nodeIdentifiers[index];
    if (nodeIdentifier === undefined) {
        throw new Error(`Missing generated node id at index ${index}`);
    }
    return nodeIdentifier;
}

function positionOf(positions: ReadonlyMap<string, number>, nodeIdentifier: string): number {
    const position = positions.get(nodeIdentifier);
    if (position === undefined) {
        throw new Error(`Missing generated node position for "${nodeIdentifier}"`);
    }
    return position;
}

function createGraph(shape: GraphShape): DirectedGraph<string, undefined> {
    const graph = createDirectedGraph<string, undefined>();

    shape.nodeIdentifiers.forEach(function (nodeIdentifier) {
        graph.addNode(nodeIdentifier, undefined);
    });

    shape.edges.forEach(function (edge) {
        graph.connect(edge);
    });

    return graph;
}

function getSortedEdges(
    graph: DirectedGraph<string, undefined>,
    nodeIdentifiers: readonly string[]
): readonly string[] {
    return nodeIdentifiers
        .flatMap(function (nodeIdentifier) {
            return Array.from(graph.getAdjacentIdentifiers(nodeIdentifier), function (adjacentIdentifier) {
                return `${nodeIdentifier}->${adjacentIdentifier}`;
            });
        })
        .toSorted(function (left, right) {
            return left.localeCompare(right);
        });
}

function createDirectedAcyclicGraphArbitrary(): fastCheck.Arbitrary<GraphShape> {
    return fastCheck.integer({ min: 1, max: 4 }).chain(function (nodeCount) {
        const nodeIdentifiers = Array.from({ length: nodeCount }, function (_unused, index) {
            return `node-${index}`;
        });
        const nodeIndexes = Array.from(nodeIdentifiers.keys());
        const possibleEdges = nodeIndexes.flatMap(function (fromIndex) {
            return nodeIndexes.flatMap(function (toIndex) {
                if (fromIndex < toIndex && toIndex !== fromIndex + 1) {
                    return [ [ fromIndex, toIndex ] as const ];
                }

                return [];
            });
        });

        return fastCheck.shuffledSubarray(possibleEdges).map(function (edges) {
            const graphShape: GraphShape = {
                nodeIdentifiers,
                edges: edges.map(function ([ fromIndex, toIndex ]) {
                    return {
                        from: nodeIdentifierAt(nodeIdentifiers, fromIndex),
                        to: nodeIdentifierAt(nodeIdentifiers, toIndex)
                    };
                })
            };
            return graphShape;
        });
    });
}

function createCyclicGraphArbitrary(): fastCheck.Arbitrary<GraphShape> {
    return fastCheck.integer({ min: 2, max: 4 }).map(function (nodeCount) {
        const nodeIdentifiers = Array.from({ length: nodeCount }, function (_unused, index) {
            return `cycle-${index}`;
        });
        const graphShape: GraphShape = {
            nodeIdentifiers,
            edges: nodeIdentifiers.map(function (nodeIdentifier, index) {
                return {
                    from: nodeIdentifier,
                    to: nodeIdentifierAt(nodeIdentifiers, (index + 1) % nodeIdentifiers.length)
                };
            })
        };
        return graphShape;
    });
}

suite('graph', function () {
    test('reverse() preserves the edge set when applied twice and reverses all original edges', function () {
        fastCheck.assert(
            fastCheck.property(createDirectedAcyclicGraphArbitrary(), function (shape) {
                const graph = createGraph(shape);
                const reversedGraph = graph.reverse();
                const reversedTwice = reversedGraph.reverse();

                assert.deepStrictEqual(
                    getSortedEdges(reversedTwice, shape.nodeIdentifiers),
                    getSortedEdges(graph, shape.nodeIdentifiers)
                );

                shape.edges.forEach(function (edge) {
                    assert.strictEqual(reversedGraph.hasConnection({ from: edge.to, to: edge.from }), true);
                });
            }),
            { numRuns: 8 }
        );
    });

    test('getTopologicalGenerations() contains every node exactly once and respects edge order for DAGs', function () {
        fastCheck.assert(
            fastCheck.property(createDirectedAcyclicGraphArbitrary(), function (shape) {
                const graph = createGraph(shape);
                const generations = graph.getTopologicalGenerations();
                const flattened = generations.flat();

                assert.deepStrictEqual(
                    Array.from(flattened).toSorted(function (left, right) {
                        return left.localeCompare(right);
                    }),
                    Array.from(shape.nodeIdentifiers).toSorted(function (left, right) {
                        return left.localeCompare(right);
                    })
                );

                const positions = new Map(
                    flattened.map(function (nodeIdentifier, index) {
                        return [ nodeIdentifier, index ];
                    })
                );
                shape.edges.forEach(function (edge) {
                    assert.ok(positionOf(positions, edge.from) < positionOf(positions, edge.to));
                });
            }),
            { numRuns: 8 }
        );
    });

    test('detectCycles() reports no cycles for generated DAGs', function () {
        fastCheck.assert(
            fastCheck.property(createDirectedAcyclicGraphArbitrary(), function (shape) {
                const graph = createGraph(shape);

                assert.deepStrictEqual(graph.detectCycles(), []);
                assert.strictEqual(graph.isCyclic(), false);
            }),
            { numRuns: 8 }
        );
    });

    test('detectCycles() reports at least one cycle for generated cyclic graphs', function () {
        fastCheck.assert(
            fastCheck.property(createCyclicGraphArbitrary(), function (shape) {
                const graph = createGraph(shape);
                const cycles = graph.detectCycles();

                assert.ok(cycles.length > 0);
                cycles.flat().forEach(function (nodeIdentifier) {
                    assert.ok(shape.nodeIdentifiers.includes(nodeIdentifier));
                });
                assert.strictEqual(graph.isCyclic(), true);
            }),
            { numRuns: 8 }
        );
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
});
