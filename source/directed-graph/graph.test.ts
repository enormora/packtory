import assert from 'node:assert';
import { suite, test, type Func } from 'mocha';
import {
    collectFromGraph,
    createGraphWithNodes,
    type GraphEdge,
    type GraphWithNodesOptions
} from '../test-libraries/graph-test-support.ts';
import { createDirectedGraph, type DirectedGraph } from './graph.ts';

function expectGraphMethodToThrow(
    method: 'connect' | 'disconnect',
    setup: (graph: DirectedGraph<string, string>) => void,
    expectedMessage: string
): void {
    const graph = createDirectedGraph<string, string>();
    setup(graph);
    try {
        graph[method]({ from: 'a', to: 'b' });
        assert.fail(`Expected ${method}() to fail but it did not`);
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

function leaveGraphWithoutNodes(graph: DirectedGraph<string, string>): void {
    assert.strictEqual(graph.hasNode('a'), false);
}

function addTargetNode(graph: DirectedGraph<string, string>): void {
    graph.addNode('b', 'bar');
}

function addSourceNode(graph: DirectedGraph<string, string>): void {
    graph.addNode('a', 'foo');
}

function addExistingConnection(graph: DirectedGraph<string, string>): void {
    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({ from: 'a', to: 'b' });
}

function addDisconnectedNodes(graph: DirectedGraph<string, string>): void {
    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
}

type NodeVisitingTestCase = GraphWithNodesOptions & {
    readonly disconnections?: readonly GraphEdge<string>[];
    readonly startId: string;
    readonly expectedCollectedIds: readonly string[];
};

function checkNodeVisiting(testCase: Readonly<NodeVisitingTestCase>): Func {
    return function () {
        const { nodes, connections, disconnections = [], expectedCollectedIds, startId } = testCase;
        const graph = createGraphWithNodes({ nodes, connections });

        disconnections.forEach(function (edge) {
            graph.disconnect(edge);
        });

        const collected = collectFromGraph(graph, startId);

        assert.deepStrictEqual(collected, expectedCollectedIds);
    };
}

const fiveNodes: readonly (readonly [string, string])[] = [
    [ 'a', 'foo' ],
    [ 'b', 'bar' ],
    [ 'c', 'baz' ],
    [ 'd', 'qux' ],
    [ 'e', 'quux' ]
];
const fiveNodeConnections: readonly GraphEdge<string>[] = [
    { from: 'a', to: 'b' },
    { from: 'a', to: 'c' },
    { from: 'b', to: 'd' },
    { from: 'd', to: 'e' }
];

suite('graph', function () {
    suite('nodes', function () {
        test('hasNode() returns false when there is no node for the given id', function () {
            const graph = createDirectedGraph<string, string>();
            assert.strictEqual(graph.hasNode('foo'), false);
        });

        test('hasNode() returns true when there is a node for the given id', function () {
            const graph = createDirectedGraph<string, string>();

            graph.addNode('foo', 'bar');

            assert.strictEqual(graph.hasNode('foo'), true);
        });

        test('addNode() throws when adding a node with an id that already exist', function () {
            const graph = createDirectedGraph<string, string>();

            graph.addNode('foo', 'bar');

            try {
                graph.addNode('foo', 'baz');
                assert.fail('Expected addNode() to fail but it did not');
            } catch (error: unknown) {
                assert.strictEqual((error as Error).message, 'Node with id "foo" already exists');
            }
        });
    });

    suite('connections', function () {
        suite('connect errors', function () {
            test('connect() throws when the from and to node don’t exist', function () {
                expectGraphMethodToThrow('connect', leaveGraphWithoutNodes, 'Node with id "a" does not exist');
            });

            test('connect() throws when the from node doesn’t exist but the to node does', function () {
                expectGraphMethodToThrow('connect', addTargetNode, 'Node with id "a" does not exist');
            });

            test('connect() throws when the to node doesn’t exist but the from node does', function () {
                expectGraphMethodToThrow('connect', addSourceNode, 'Node with id "b" does not exist');
            });

            test('connect() throws when both nodes exist but there is already a connection', function () {
                expectGraphMethodToThrow(
                    'connect',
                    addExistingConnection,
                    'Edge from "a" to "b" already exists'
                );
            });
        });

        suite('disconnect errors', function () {
            test('disconnect() throws when the from and to node don’t exist', function () {
                expectGraphMethodToThrow('disconnect', leaveGraphWithoutNodes, 'Node with id "a" does not exist');
            });

            test('disconnect() throws when the from node doesn’t exist but the to node does', function () {
                expectGraphMethodToThrow('disconnect', addTargetNode, 'Node with id "a" does not exist');
            });

            test('disconnect() throws when the to node doesn’t exist but the from node does', function () {
                expectGraphMethodToThrow('disconnect', addSourceNode, 'Node with id "b" does not exist');
            });

            test('disconnect() throws when both nodes exist but there is no connection', function () {
                expectGraphMethodToThrow(
                    'disconnect',
                    addDisconnectedNodes,
                    'Edge from "a" to "b" does not exist'
                );
            });
        });

        suite('connection queries', function () {
            test('hasConnection() returns false when there is no connection for the given ids', function () {
                const graph = createDirectedGraph<string, string>();

                graph.addNode('a', 'foo');
                graph.addNode('b', 'bar');

                assert.strictEqual(graph.hasConnection({ from: 'a', to: 'b' }), false);
            });

            test('hasNode() returns true when there is a connection between the given nodes', function () {
                const graph = createDirectedGraph<string, string>();

                graph.addNode('a', 'foo');
                graph.addNode('b', 'bar');
                graph.connect({ from: 'a', to: 'b' });

                assert.strictEqual(graph.hasConnection({ from: 'a', to: 'b' }), true);
            });

            test('disconnect() removes a self connection from cycle and topological accounting', function () {
                const graph = createDirectedGraph<string, string>();
                graph.addNode('a', 'foo');
                graph.connect({ from: 'a', to: 'a' });

                graph.disconnect({ from: 'a', to: 'a' });

                assert.strictEqual(graph.hasConnection({ from: 'a', to: 'a' }), false);
                assert.strictEqual(graph.isCyclic(), false);
                assert.deepStrictEqual(graph.getTopologicalGenerations(), [ [ 'a' ] ]);
            });
        });
    });

    suite('breadth-first traversal', function () {
        test('throws when there is no node for the given start id', function () {
            const graph = createDirectedGraph<string, string>();

            try {
                collectFromGraph(graph, 'foo');
                assert.fail('Expected visitBreadthFirstSearch() to fail but it did not');
            } catch (error: unknown) {
                assert.strictEqual((error as Error).message, 'Node with id "foo" does not exist');
            }
        });

        test('visits the start node first', function () {
            const graph = createDirectedGraph<string, string>();

            graph.addNode('a', 'foo');

            const collected = collectFromGraph(graph, 'a');

            assert.deepStrictEqual(collected, [ 'a' ]);
        });

        test(
            'visits only the start node when there are multiple nodes but no connections',
            checkNodeVisiting({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ],
                    [ 'c', 'baz' ]
                ],
                connections: [ { from: 'b', to: 'c' } ],
                startId: 'a',
                expectedCollectedIds: [ 'a' ]
            })
        );

        test(
            'visits the start node and all connected nodes',
            checkNodeVisiting({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ]
                ],
                connections: [ { from: 'a', to: 'b' } ],
                startId: 'a',
                expectedCollectedIds: [ 'a', 'b' ]
            })
        );

        test(
            'visits ONLY the start node when there are two nodes but the start node is not connected to other but the other is connected to the start node',
            checkNodeVisiting({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ]
                ],
                connections: [ { from: 'b', to: 'a' } ],
                startId: 'a',
                expectedCollectedIds: [ 'a' ]
            })
        );

        test(
            'visits the start node and multiple connected nodes',
            checkNodeVisiting({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ],
                    [ 'c', 'baz' ]
                ],
                connections: [
                    { from: 'a', to: 'b' },
                    { from: 'a', to: 'c' }
                ],
                startId: 'a',
                expectedCollectedIds: [ 'a', 'b', 'c' ]
            })
        );

        suite('larger traversal graphs', function () {
            test(
                'visits the start node and multiple connected nodes and their subsequent nodes',
                checkNodeVisiting({
                    nodes: fiveNodes,
                    connections: fiveNodeConnections,
                    startId: 'a',
                    expectedCollectedIds: [ 'a', 'b', 'c', 'd', 'e' ]
                })
            );

            test(
                'visits only the nodes that are still connected after disconnecting some',
                checkNodeVisiting({
                    nodes: fiveNodes,
                    connections: fiveNodeConnections,
                    disconnections: [ { from: 'a', to: 'b' } ],
                    startId: 'a',
                    expectedCollectedIds: [ 'a', 'c' ]
                })
            );

            test(
                'visits the two nodes that are connected to each other',
                checkNodeVisiting({
                    nodes: [
                        [ 'a', 'foo' ],
                        [ 'b', 'bar' ]
                    ],
                    connections: [
                        { from: 'a', to: 'b' },
                        { from: 'b', to: 'a' }
                    ],
                    startId: 'a',
                    expectedCollectedIds: [ 'a', 'b' ]
                })
            );

            test(
                'visits the three nodes which have a cyclic connection',
                checkNodeVisiting({
                    nodes: [
                        [ 'a', 'foo' ],
                        [ 'b', 'bar' ],
                        [ 'c', 'baz' ]
                    ],
                    connections: [
                        { from: 'a', to: 'b' },
                        { from: 'b', to: 'c' },
                        { from: 'c', to: 'a' }
                    ],
                    startId: 'a',
                    expectedCollectedIds: [ 'a', 'b', 'c' ]
                })
            );

            test(
                'continues with later pending nodes after skipping an already visited node',
                checkNodeVisiting({
                    nodes: [
                        [ 'a', 'foo' ],
                        [ 'b', 'bar' ],
                        [ 'c', 'baz' ],
                        [ 'd', 'qux' ],
                        [ 'e', 'quux' ]
                    ],
                    connections: [
                        { from: 'a', to: 'b' },
                        { from: 'a', to: 'c' },
                        { from: 'b', to: 'd' },
                        { from: 'c', to: 'd' },
                        { from: 'c', to: 'e' }
                    ],
                    startId: 'a',
                    expectedCollectedIds: [ 'a', 'b', 'c', 'd', 'e' ]
                })
            );

            test(
                'visits ONLY the starting node when it is connected to itself',
                checkNodeVisiting({
                    nodes: [ [ 'a', 'foo' ] ],
                    connections: [ { from: 'a', to: 'a' } ],
                    startId: 'a',
                    expectedCollectedIds: [ 'a' ]
                })
            );

            test(
                'visits only the nodes that are connected with the starting id',
                checkNodeVisiting({
                    nodes: [
                        [ 'a', 'foo' ],
                        [ 'b', 'bar' ],
                        [ 'c', 'baz' ]
                    ],
                    connections: [
                        { from: 'a', to: 'b' },
                        { from: 'b', to: 'c' }
                    ],
                    startId: 'b',
                    expectedCollectedIds: [ 'b', 'c' ]
                })
            );
        });
    });

    suite('cycles', function () {
        test('detectCycles() returns an empty array for an empty graph', function () {
            const graph = createDirectedGraph<string, string>();

            assert.deepStrictEqual(graph.detectCycles(), []);
        });

        test('detectCycles() returns an empty array for a non-cyclic graph', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ]
                ],
                connections: [ { from: 'a', to: 'b' } ]
            });

            assert.deepStrictEqual(graph.detectCycles(), []);
        });

        test('detectCycles() returns the detected cycle when a node is referencing itself', function () {
            const graph = createGraphWithNodes({
                nodes: [ [ 'a', 'foo' ] ],
                connections: [ { from: 'a', to: 'a' } ]
            });

            assert.deepStrictEqual(graph.detectCycles(), [ [ 'a', 'a' ] ]);
        });

        test('detectCycles() returns the detected cycle when a node is indirectly referencing itself', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ]
                ],
                connections: [
                    { from: 'a', to: 'b' },
                    { from: 'b', to: 'a' }
                ]
            });

            assert.deepStrictEqual(graph.detectCycles(), [ [ 'a', 'b', 'a' ] ]);
        });

        test('detectCycles() detects multiple cycles in the same root node', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ],
                    [ 'c', 'baz' ],
                    [ 'd', 'qux' ]
                ],
                connections: [
                    { from: 'a', to: 'b' },
                    { from: 'b', to: 'a' },
                    { from: 'b', to: 'c' },
                    { from: 'c', to: 'd' },
                    { from: 'd', to: 'c' }
                ]
            });

            assert.deepStrictEqual(graph.detectCycles(), [
                [ 'a', 'b', 'a' ],
                [ 'a', 'b', 'c', 'd', 'c' ]
            ]);
        });

        test('detectCycles() detects multiple cycles which are not connected', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ],
                    [ 'c', 'baz' ]
                ],
                connections: [
                    { from: 'a', to: 'b' },
                    { from: 'b', to: 'a' },
                    { from: 'c', to: 'c' }
                ]
            });

            assert.deepStrictEqual(graph.detectCycles(), [
                [ 'a', 'b', 'a' ],
                [ 'c', 'c' ]
            ]);
        });

        test('detectCycles() returns an empty array for a non-cyclic graph even when adjacent nodes of the base node reference a certain node multiple times within the graph', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', '' ],
                    [ 'b', '' ],
                    [ 'c', '' ]
                ],
                connections: [
                    { from: 'b', to: 'a' },
                    { from: 'c', to: 'a' },
                    { from: 'c', to: 'b' }
                ]
            });

            assert.deepStrictEqual(graph.detectCycles(), []);
        });

        test('detectCycles() returns all detected cycles when one base node has multiple cycles in its adjacent nodes', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', '' ],
                    [ 'b', '' ],
                    [ 'c', '' ],
                    [ 'd', '' ],
                    [ 'e', '' ]
                ],
                connections: [
                    { from: 'a', to: 'b' },
                    { from: 'a', to: 'c' },
                    { from: 'b', to: 'd' },
                    { from: 'c', to: 'd' },
                    { from: 'd', to: 'e' },
                    { from: 'e', to: 'a' },
                    { from: 'e', to: 'c' }
                ]
            });

            assert.deepStrictEqual(graph.detectCycles(), [
                [ 'a', 'b', 'd', 'e', 'a' ],
                [ 'a', 'b', 'd', 'e', 'c', 'd' ],
                [ 'a', 'c', 'd', 'e', 'a' ],
                [ 'a', 'c', 'd', 'e', 'c' ]
            ]);
        });

        test('isCyclic() returns true when there is one cycle in the graph', function () {
            const graph = createGraphWithNodes({
                nodes: [ [ 'a', '' ] ],
                connections: [ { from: 'a', to: 'a' } ]
            });

            assert.strictEqual(graph.isCyclic(), true);
        });

        test('isCyclic() returns false when there is no cycle in the graph', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', '' ],
                    [ 'b', '' ]
                ],
                connections: [ { from: 'a', to: 'b' } ]
            });

            assert.strictEqual(graph.isCyclic(), false);
        });
    });

    suite('topological generations', function () {
        test('getTopologicalGenerations() separates dependent nodes into later generations', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ],
                    [ 'c', 'baz' ]
                ],
                connections: [
                    { from: 'a', to: 'b' },
                    { from: 'b', to: 'c' }
                ]
            });

            assert.deepStrictEqual(graph.getTopologicalGenerations(), [ [ 'a' ], [ 'b' ], [ 'c' ] ]);
        });

        test('reverse() flips connection direction and topological order', function () {
            const graph = createGraphWithNodes({
                nodes: [
                    [ 'a', 'foo' ],
                    [ 'b', 'bar' ]
                ],
                connections: [ { from: 'a', to: 'b' } ]
            });

            assert.strictEqual(graph.reverse().hasConnection({ from: 'b', to: 'a' }), true);
            assert.deepStrictEqual(graph.reverse().getTopologicalGenerations(), [ [ 'b' ], [ 'a' ] ]);
        });
    });
});
