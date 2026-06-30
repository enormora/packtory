import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { createDirectedGraph, type DirectedGraph } from './graph.ts';

type GraphEdge<TId extends number | string> = Parameters<DirectedGraph<TId, unknown>['connect']>[0];

type GraphShape = {
    readonly nodeIds: readonly string[];
    readonly edges: readonly GraphEdge<string>[];
};

function nodeIdAt(nodeIds: readonly string[], index: number): string {
    const nodeId = nodeIds[index];
    if (nodeId === undefined) {
        throw new Error(`Missing generated node id at index ${index}`);
    }
    return nodeId;
}

function positionOf(positions: ReadonlyMap<string, number>, nodeId: string): number {
    const position = positions.get(nodeId);
    if (position === undefined) {
        throw new Error(`Missing generated node position for "${nodeId}"`);
    }
    return position;
}

function createGraph(shape: GraphShape): DirectedGraph<string, undefined> {
    const graph = createDirectedGraph<string, undefined>();

    shape.nodeIds.forEach(function (nodeId) {
        graph.addNode(nodeId, undefined);
    });

    shape.edges.forEach(function (edge) {
        graph.connect(edge);
    });

    return graph;
}

function getSortedEdges(graph: DirectedGraph<string, undefined>, nodeIds: readonly string[]): readonly string[] {
    return nodeIds
        .flatMap(function (nodeId) {
            return Array.from(graph.getAdjacentIds(nodeId), function (adjacentId) {
                return `${nodeId}->${adjacentId}`;
            });
        })
        .toSorted(function (left, right) {
            return left.localeCompare(right);
        });
}

function createDagArbitrary(): fc.Arbitrary<GraphShape> {
    return fc.integer({ min: 1, max: 4 }).chain(function (nodeCount) {
        const nodeIds = Array.from({ length: nodeCount }, function (_unused, index) {
            return `node-${index}`;
        });
        const nodeIndexes = Array.from(nodeIds.keys());
        const possibleEdges = nodeIndexes.flatMap(function (fromIndex) {
            return nodeIndexes.flatMap(function (toIndex) {
                if (fromIndex < toIndex && toIndex !== fromIndex + 1) {
                    return [ [ fromIndex, toIndex ] as const ];
                }

                return [];
            });
        });

        return fc.shuffledSubarray(possibleEdges).map(function (edges) {
            const graphShape: GraphShape = {
                nodeIds,
                edges: edges.map(function ([ fromIndex, toIndex ]) {
                    return { from: nodeIdAt(nodeIds, fromIndex), to: nodeIdAt(nodeIds, toIndex) };
                })
            };
            return graphShape;
        });
    });
}

function createCyclicGraphArbitrary(): fc.Arbitrary<GraphShape> {
    return fc.integer({ min: 2, max: 4 }).map(function (nodeCount) {
        const nodeIds = Array.from({ length: nodeCount }, function (_unused, index) {
            return `cycle-${index}`;
        });
        const graphShape: GraphShape = {
            nodeIds,
            edges: nodeIds.map(function (nodeId, index) {
                return {
                    from: nodeId,
                    to: nodeIdAt(nodeIds, (index + 1) % nodeIds.length)
                };
            })
        };
        return graphShape;
    });
}

suite('graph', function () {
    test('reverse() preserves the edge set when applied twice and reverses all original edges', function () {
        fc.assert(
            fc.property(createDagArbitrary(), function (shape) {
                const graph = createGraph(shape);
                const reversedGraph = graph.reverse();
                const reversedTwice = reversedGraph.reverse();

                assert.deepStrictEqual(
                    getSortedEdges(reversedTwice, shape.nodeIds),
                    getSortedEdges(graph, shape.nodeIds)
                );

                shape.edges.forEach(function (edge) {
                    assert.strictEqual(reversedGraph.hasConnection({ from: edge.to, to: edge.from }), true);
                });
            }),
            { numRuns: 8 }
        );
    });

    test('getTopologicalGenerations() contains every node exactly once and respects edge order for DAGs', function () {
        fc.assert(
            fc.property(createDagArbitrary(), function (shape) {
                const graph = createGraph(shape);
                const generations = graph.getTopologicalGenerations();
                const flattened = generations.flat();

                assert.deepStrictEqual(
                    Array.from(flattened).toSorted(function (left, right) {
                        return left.localeCompare(right);
                    }),
                    Array.from(shape.nodeIds).toSorted(function (left, right) {
                        return left.localeCompare(right);
                    })
                );

                const positions = new Map(
                    flattened.map(function (nodeId, index) {
                        return [ nodeId, index ];
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
        fc.assert(
            fc.property(createDagArbitrary(), function (shape) {
                const graph = createGraph(shape);

                assert.deepStrictEqual(graph.detectCycles(), []);
                assert.strictEqual(graph.isCyclic(), false);
            }),
            { numRuns: 8 }
        );
    });

    test('detectCycles() reports at least one cycle for generated cyclic graphs', function () {
        fc.assert(
            fc.property(createCyclicGraphArbitrary(), function (shape) {
                const graph = createGraph(shape);
                const cycles = graph.detectCycles();

                assert.ok(cycles.length > 0);
                cycles.flat().forEach(function (nodeId) {
                    assert.ok(shape.nodeIds.includes(nodeId));
                });
                assert.strictEqual(graph.isCyclic(), true);
            }),
            { numRuns: 8 }
        );
    });
});
