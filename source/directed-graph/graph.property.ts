import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { createDirectedGraph, type DirectedGraph } from './graph.ts';

type GraphEdge<TId extends number | string> = Parameters<DirectedGraph<TId, unknown>['connect']>[0];

type GraphShape = {
    readonly nodeIds: readonly string[];
    readonly edges: readonly GraphEdge<string>[];
};

function createGraph(shape: GraphShape): DirectedGraph<string, undefined> {
    const graph = createDirectedGraph<string, undefined>();

    shape.nodeIds.forEach((nodeId) => {
        graph.addNode(nodeId, undefined);
    });

    shape.edges.forEach((edge) => {
        graph.connect(edge);
    });

    return graph;
}

function getSortedEdges(graph: DirectedGraph<string, undefined>, nodeIds: readonly string[]): readonly string[] {
    return nodeIds
        .flatMap((nodeId) => {
            return Array.from(graph.getAdjacentIds(nodeId), (adjacentId) => {
                return `${nodeId}->${adjacentId}`;
            });
        })
        .toSorted();
}

function createDagArbitrary(): fc.Arbitrary<GraphShape> {
    return fc.integer({ min: 1, max: 4 }).chain((nodeCount) => {
        const nodeIds = Array.from({ length: nodeCount }, (_, index) => {
            return `node-${index}`;
        });
        const possibleEdges = nodeIds.flatMap((_, fromIndex) => {
            return nodeIds.flatMap((__, toIndex) => {
                if (fromIndex < toIndex && toIndex !== fromIndex + 1) {
                    return [[fromIndex, toIndex] as const];
                }

                return [];
            });
        });

        return fc.shuffledSubarray(possibleEdges).map((edges) => {
            return {
                nodeIds,
                edges: edges.map(([fromIndex, toIndex]) => {
                    return { from: nodeIds[fromIndex]!, to: nodeIds[toIndex]! };
                })
            } satisfies GraphShape;
        });
    });
}

function createCyclicGraphArbitrary(): fc.Arbitrary<GraphShape> {
    return fc.integer({ min: 2, max: 4 }).map((nodeCount) => {
        const nodeIds = Array.from({ length: nodeCount }, (_, index) => {
            return `cycle-${index}`;
        });
        return {
            nodeIds,
            edges: nodeIds.map((nodeId, index) => {
                return {
                    from: nodeId,
                    to: nodeIds[(index + 1) % nodeIds.length]!
                };
            })
        } satisfies GraphShape;
    });
}

suite('graph', function () {
    test('reverse() preserves the edge set when applied twice and reverses all original edges', function () {
        fc.assert(
            fc.property(createDagArbitrary(), (shape) => {
                const graph = createGraph(shape);
                const reversedGraph = graph.reverse();
                const reversedTwice = reversedGraph.reverse();

                assert.deepStrictEqual(
                    getSortedEdges(reversedTwice, shape.nodeIds),
                    getSortedEdges(graph, shape.nodeIds)
                );

                shape.edges.forEach((edge) => {
                    assert.strictEqual(reversedGraph.hasConnection({ from: edge.to, to: edge.from }), true);
                });
            }),
            { numRuns: 8 }
        );
    });

    test('getTopologicalGenerations() contains every node exactly once and respects edge order for DAGs', function () {
        fc.assert(
            fc.property(createDagArbitrary(), (shape) => {
                const graph = createGraph(shape);
                const generations = graph.getTopologicalGenerations();
                const flattened = generations.flat();

                assert.deepStrictEqual(Array.from(flattened).toSorted(), Array.from(shape.nodeIds).toSorted());

                const positions = new Map(
                    flattened.map((nodeId, index) => {
                        return [nodeId, index];
                    })
                );
                shape.edges.forEach((edge) => {
                    assert.ok(positions.get(edge.from)! < positions.get(edge.to)!);
                });
            }),
            { numRuns: 8 }
        );
    });

    test('detectCycles() reports no cycles for generated DAGs', function () {
        fc.assert(
            fc.property(createDagArbitrary(), (shape) => {
                const graph = createGraph(shape);

                assert.deepStrictEqual(graph.detectCycles(), []);
                assert.strictEqual(graph.isCyclic(), false);
            }),
            { numRuns: 8 }
        );
    });

    test('detectCycles() reports at least one cycle for generated cyclic graphs', function () {
        fc.assert(
            fc.property(createCyclicGraphArbitrary(), (shape) => {
                const graph = createGraph(shape);
                const cycles = graph.detectCycles();

                assert.ok(cycles.length > 0);
                cycles.flat().forEach((nodeId) => {
                    assert.ok(shape.nodeIds.includes(nodeId));
                });
                assert.strictEqual(graph.isCyclic(), true);
            }),
            { numRuns: 8 }
        );
    });
});
