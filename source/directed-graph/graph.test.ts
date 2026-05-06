import assert from 'node:assert';
import { test, type Func } from 'mocha';
import { createDirectedGraph, type GraphEdge, type DirectedGraph } from './graph.ts';

test('hasNode() returns false when there is no node for the given id', () => {
    const graph = createDirectedGraph<string, string>();
    assert.strictEqual(graph.hasNode('foo'), false);
});

test('hasNode() returns true when there is a node for the given id', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('foo', 'bar');

    assert.strictEqual(graph.hasNode('foo'), true);
});

test('addNode() throws when adding a node with an id that already exist', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('foo', 'bar');

    try {
        graph.addNode('foo', 'baz');
        assert.fail('Expected addNode() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "foo" already exists');
    }
});

test('connect() throws when the from and to node don’t exist', () => {
    const graph = createDirectedGraph<string, string>();

    try {
        graph.connect({ from: 'a', to: 'b' });
        assert.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "a" does not exist');
    }
});

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

test('connect() throws when the from node doesn’t exist but the to node does', () => {
    expectGraphMethodToThrow(
        'connect',
        (graph) => {
            graph.addNode('b', 'bar');
        },
        'Node with id "a" does not exist'
    );
});

test('connect() throws when the to node doesn’t exist but the from node does', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');

    try {
        graph.connect({ from: 'a', to: 'b' });
        assert.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "b" does not exist');
    }
});

test('connect() throws when both nodes exist but there is already a connection', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({ from: 'a', to: 'b' });

    try {
        graph.connect({ from: 'a', to: 'b' });
        assert.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Edge from "a" to "b" already exists');
    }
});

test('disconnect() throws when the from and to node don’t exist', () => {
    const graph = createDirectedGraph<string, string>();

    try {
        graph.disconnect({ from: 'a', to: 'b' });
        assert.fail('Expected disconnect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "a" does not exist');
    }
});

test('disconnect() throws when the from node doesn’t exist but the to node does', () => {
    expectGraphMethodToThrow(
        'disconnect',
        (graph) => {
            graph.addNode('b', 'bar');
        },
        'Node with id "a" does not exist'
    );
});

test('disconnect() throws when the to node doesn’t exist but the from node does', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');

    try {
        graph.disconnect({ from: 'a', to: 'b' });
        assert.fail('Expected disconnect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "b" does not exist');
    }
});

test('disconnect() throws when both nodes exist but there is no connection', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');

    try {
        graph.disconnect({ from: 'a', to: 'b' });
        assert.fail('Expected disconnect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Edge from "a" to "b" does not exist');
    }
});

test('hasConnection() returns false when there is no connection for the given ids', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');

    assert.strictEqual(graph.hasConnection({ from: 'a', to: 'b' }), false);
});

test('hasNode() returns true when there is a connection between the given nodes', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({ from: 'a', to: 'b' });

    assert.strictEqual(graph.hasConnection({ from: 'a', to: 'b' }), true);
});

function collectFromGraph(graph: DirectedGraph<string, string>, startId: string): readonly string[] {
    const collected: string[] = [];

    graph.visitBreadthFirstSearch(startId, (node) => {
        collected.push(node.id);
    });

    return collected;
}

test('throws when there is no node for the given start id', () => {
    const graph = createDirectedGraph<string, string>();

    try {
        collectFromGraph(graph, 'foo');
        assert.fail('Expected visitBreadthFirstSearch() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "foo" does not exist');
    }
});

test('visits the start node first', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');

    const collected = collectFromGraph(graph, 'a');

    assert.deepStrictEqual(collected, ['a']);
});

type GraphWithNodesOptions = {
    readonly nodes: readonly (readonly [id: string, data: string])[];
    readonly connections: readonly GraphEdge<string>[];
};

function createGraphWithNodes(options: GraphWithNodesOptions): DirectedGraph<string, string> {
    const { nodes, connections } = options;
    const graph = createDirectedGraph<string, string>();

    nodes.forEach(([id, data]) => {
        graph.addNode(id, data);
    });

    connections.forEach((edge) => {
        graph.connect(edge);
    });

    return graph;
}

type NodeVisitingTestCase = GraphWithNodesOptions & {
    readonly disconnections?: GraphEdge<string>[];
    readonly startId: string;
    readonly expectedCollectedIds: string[];
};

function checkNodeVisiting(testCase: Readonly<NodeVisitingTestCase>): Func {
    return () => {
        const { nodes, connections, disconnections = [], expectedCollectedIds, startId } = testCase;
        const graph = createGraphWithNodes({ nodes, connections });

        disconnections.forEach((edge) => {
            graph.disconnect(edge);
        });

        const collected = collectFromGraph(graph, startId);

        assert.deepStrictEqual(collected, expectedCollectedIds);
    };
}

test(
    'visits only the start node when there are multiple nodes but no connections',
    checkNodeVisiting({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar'],
            ['c', 'baz']
        ],
        connections: [{ from: 'b', to: 'c' }],
        startId: 'a',
        expectedCollectedIds: ['a']
    })
);

test(
    'visits the start node and all connected nodes',
    checkNodeVisiting({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar']
        ],
        connections: [{ from: 'a', to: 'b' }],
        startId: 'a',
        expectedCollectedIds: ['a', 'b']
    })
);

test(
    'visits ONLY the start node when there are two nodes but the start node is not connected to other but the other is connected to the start node',
    checkNodeVisiting({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar']
        ],
        connections: [{ from: 'b', to: 'a' }],
        startId: 'a',
        expectedCollectedIds: ['a']
    })
);

test(
    'visits the start node and multiple connected nodes',
    checkNodeVisiting({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar'],
            ['c', 'baz']
        ],
        connections: [
            { from: 'a', to: 'b' },
            { from: 'a', to: 'c' }
        ],
        startId: 'a',
        expectedCollectedIds: ['a', 'b', 'c']
    })
);

const fiveNodes: readonly (readonly [string, string])[] = [
    ['a', 'foo'],
    ['b', 'bar'],
    ['c', 'baz'],
    ['d', 'qux'],
    ['e', 'quux']
];
const fiveNodeConnections: readonly GraphEdge<string>[] = [
    { from: 'a', to: 'b' },
    { from: 'a', to: 'c' },
    { from: 'b', to: 'd' },
    { from: 'd', to: 'e' }
];

const fourEmptyNodes: readonly (readonly [string, string])[] = [
    ['a', ''],
    ['b', ''],
    ['c', ''],
    ['d', '']
];

test(
    'visits the start node and multiple connected nodes and their subsequent nodes',
    checkNodeVisiting({
        nodes: fiveNodes,
        connections: fiveNodeConnections,
        startId: 'a',
        expectedCollectedIds: ['a', 'b', 'c', 'd', 'e']
    })
);

test(
    'visits only the nodes that are still connected after disconnecting some',
    checkNodeVisiting({
        nodes: fiveNodes,
        connections: fiveNodeConnections,
        disconnections: [{ from: 'a', to: 'b' }],
        startId: 'a',
        expectedCollectedIds: ['a', 'c']
    })
);

test(
    'visits the two nodes that are connected to each other',
    checkNodeVisiting({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar']
        ],
        connections: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'a' }
        ],
        startId: 'a',
        expectedCollectedIds: ['a', 'b']
    })
);

test(
    'visits the three nodes which have a cyclic connection',
    checkNodeVisiting({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar'],
            ['c', 'baz']
        ],
        connections: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' },
            { from: 'c', to: 'a' }
        ],
        startId: 'a',
        expectedCollectedIds: ['a', 'b', 'c']
    })
);

test(
    'visits ONLY the starting node when it is connected to itself',
    checkNodeVisiting({
        nodes: [['a', 'foo']],
        connections: [{ from: 'a', to: 'a' }],
        startId: 'a',
        expectedCollectedIds: ['a']
    })
);

test(
    'visits only the nodes that are connected with the starting id',
    checkNodeVisiting({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar'],
            ['c', 'baz']
        ],
        connections: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' }
        ],
        startId: 'b',
        expectedCollectedIds: ['b', 'c']
    })
);

test('detectCycles() returns an empty array for an empty graph', () => {
    const graph = createDirectedGraph<string, string>();

    assert.deepStrictEqual(graph.detectCycles(), []);
});

test('detectCycles() returns an empty array for a non-cyclic graph', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar']
        ],
        connections: [{ from: 'a', to: 'b' }]
    });

    assert.deepStrictEqual(graph.detectCycles(), []);
});

test('detectCycles() returns the detected cycle when a node is referencing itself', () => {
    const graph = createGraphWithNodes({
        nodes: [['a', 'foo']],
        connections: [{ from: 'a', to: 'a' }]
    });

    assert.deepStrictEqual(graph.detectCycles(), [['a', 'a']]);
});

test('detectCycles() returns the detected cycle when a node is indirectly referencing itself', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar']
        ],
        connections: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'a' }
        ]
    });

    assert.deepStrictEqual(graph.detectCycles(), [['a', 'b', 'a']]);
});

test('detectCycles() detects multiple cycles in the same root node', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar'],
            ['c', 'baz'],
            ['d', 'qux']
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
        ['a', 'b', 'a'],
        ['a', 'b', 'c', 'd', 'c']
    ]);
});

test('detectCycles() detects multiple cycles which are not connected', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar'],
            ['c', 'baz']
        ],
        connections: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'a' },
            { from: 'c', to: 'c' }
        ]
    });

    assert.deepStrictEqual(graph.detectCycles(), [
        ['a', 'b', 'a'],
        ['c', 'c']
    ]);
});

test('detectCycles() returns an empty array for a non-cyclic graph even when adjacent nodes of the base node reference a certain node multiple times within the graph', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', ''],
            ['c', '']
        ],
        connections: [
            { from: 'b', to: 'a' },
            { from: 'c', to: 'a' },
            { from: 'c', to: 'b' }
        ]
    });

    assert.deepStrictEqual(graph.detectCycles(), []);
});

test('detectCycles() returns all detected cycles when one base node has multiple cycles in its adjacent nodes', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', ''],
            ['c', ''],
            ['d', ''],
            ['e', '']
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
        ['a', 'b', 'd', 'e', 'a'],
        ['a', 'b', 'd', 'e', 'c', 'd'],
        ['a', 'c', 'd', 'e', 'a'],
        ['a', 'c', 'd', 'e', 'c']
    ]);
});

test('isCyclic() returns true when there is one cycle in the graph', () => {
    const graph = createGraphWithNodes({
        nodes: [['a', '']],
        connections: [{ from: 'a', to: 'a' }]
    });

    assert.strictEqual(graph.isCyclic(), true);
});

test('isCyclic() returns false when there is no cycle in the graph', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', '']
        ],
        connections: [{ from: 'a', to: 'b' }]
    });

    assert.strictEqual(graph.isCyclic(), false);
});

test('getTopologicalGenerations() throws when the graph is cyclic', () => {
    const graph = createGraphWithNodes({
        nodes: [['a', '']],
        connections: [{ from: 'a', to: 'a' }]
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

test('getTopologicalGenerations() returns an empty array when the graph is empty', () => {
    const graph = createDirectedGraph<string, string>();
    const generations = graph.getTopologicalGenerations();

    assert.deepStrictEqual(generations, []);
});

test('getTopologicalGenerations() returns one generation when there is only one node', () => {
    const graph = createGraphWithNodes({
        nodes: [['a', '']],
        connections: []
    });

    const generations = graph.getTopologicalGenerations();

    assert.deepStrictEqual(generations, [['a']]);
});

test('getTopologicalGenerations() returns one generation when there are multiple non-connected nodes', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', ''],
            ['c', '']
        ],
        connections: []
    });

    const generations = graph.getTopologicalGenerations();

    assert.deepStrictEqual(generations, [['a', 'b', 'c']]);
});

test('getTopologicalGenerations() returns two generations when there are two nodes which are connected', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', '']
        ],
        connections: [{ from: 'a', to: 'b' }]
    });

    const generations = graph.getTopologicalGenerations();

    assert.deepStrictEqual(generations, [['a'], ['b']]);
});

test('getTopologicalGenerations() returns two generations when there are three nodes which are connected with two roots', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', ''],
            ['c', '']
        ],
        connections: [{ from: 'a', to: 'b' }]
    });

    const generations = graph.getTopologicalGenerations();

    assert.deepStrictEqual(generations, [['a', 'c'], ['b']]);
});

test('getTopologicalGenerations() returns two generations when there are three nodes which are connected with one root', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', ''],
            ['c', '']
        ],
        connections: [
            { from: 'a', to: 'b' },
            { from: 'a', to: 'c' }
        ]
    });

    const generations = graph.getTopologicalGenerations();

    assert.deepStrictEqual(generations, [['a'], ['b', 'c']]);
});

test('getTopologicalGenerations() returns multiple generations of two independent paths', () => {
    const graph = createGraphWithNodes({
        nodes: fourEmptyNodes,
        connections: [
            { from: 'a', to: 'b' },
            { from: 'c', to: 'd' }
        ]
    });

    const generations = graph.getTopologicalGenerations();

    assert.deepStrictEqual(generations, [
        ['a', 'c'],
        ['b', 'd']
    ]);
});

test('getTopologicalGenerations() returns multiple generations of two dependent paths', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', ''],
            ['c', ''],
            ['d', ''],
            ['e', ''],
            ['f', '']
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

    assert.deepStrictEqual(generations, [['a', 'c'], ['d'], ['e'], ['b', 'f']]);
});

test('getTopologicalGenerations() keeps a shared dependency in a later generation until all incoming edges are consumed', () => {
    const graph = createGraphWithNodes({
        nodes: fourEmptyNodes,
        connections: [
            { from: 'a', to: 'c' },
            { from: 'b', to: 'c' },
            { from: 'c', to: 'd' }
        ]
    });

    const generations = graph.getTopologicalGenerations();

    assert.deepStrictEqual(generations, [['a', 'b'], ['c'], ['d']]);
});

test('disconnect() updates incoming-edge counts used by topological generations', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', ''],
            ['c', '']
        ],
        connections: [
            { from: 'a', to: 'c' },
            { from: 'b', to: 'c' }
        ]
    });

    graph.disconnect({ from: 'b', to: 'c' });

    assert.deepStrictEqual(graph.getTopologicalGenerations(), [['a', 'b'], ['c']]);

    graph.disconnect({ from: 'a', to: 'c' });

    assert.deepStrictEqual(graph.getTopologicalGenerations(), [['a', 'b', 'c']]);
});

test('traverse() visits each reachable node once across disconnected roots', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', 'first'],
            ['b', 'second'],
            ['c', 'third'],
            ['d', 'fourth'],
            ['e', 'fifth']
        ],
        connections: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' },
            { from: 'd', to: 'e' }
        ]
    });
    const visited: string[] = [];

    graph.traverse((node) => {
        visited.push(`${node.id}:${node.incomingEdges}`);
    });

    assert.deepStrictEqual(visited, ['a:0', 'b:1', 'c:1', 'd:0', 'e:1']);
});

test('visitBreadthFirstSearch() visits shared descendants only once', () => {
    const graph = createGraphWithNodes({
        nodes: fourEmptyNodes,
        connections: [
            { from: 'a', to: 'b' },
            { from: 'a', to: 'c' },
            { from: 'b', to: 'd' },
            { from: 'c', to: 'd' }
        ]
    });

    assert.deepStrictEqual(collectFromGraph(graph, 'a'), ['a', 'b', 'c', 'd']);
});

function buildSimpleAToBGraphWithReverse(): {
    readonly graph: DirectedGraph<string, string>;
    readonly reversedGraph: DirectedGraph<string, string>;
} {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar']
        ],
        connections: [{ from: 'a', to: 'b' }]
    });
    return { graph, reversedGraph: graph.reverse() };
}

test('reverse() returns a new graph with the edges reversed', () => {
    const { graph, reversedGraph } = buildSimpleAToBGraphWithReverse();

    assert.strictEqual(graph.hasConnection({ from: 'a', to: 'b' }), true);
    assert.strictEqual(graph.hasConnection({ from: 'b', to: 'a' }), false);
    assert.strictEqual(reversedGraph.hasConnection({ from: 'a', to: 'b' }), false);
    assert.strictEqual(reversedGraph.hasConnection({ from: 'b', to: 'a' }), true);
});

test('reverse() copies all nodes with their data', () => {
    const { reversedGraph } = buildSimpleAToBGraphWithReverse();
    const collectedNodes: unknown[] = [];

    reversedGraph.visitBreadthFirstSearch('b', (node) => {
        collectedNodes.push(node);
    });

    assert.deepStrictEqual(collectedNodes, [
        {
            id: 'b',
            data: 'bar',
            adjacentNodeIds: new Set(['a']),
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

test('getAdjacentIds() returns an empty Set if the requested node doesn’t have any connections', () => {
    const graph = createGraphWithNodes({
        nodes: [['a', '']],
        connections: []
    });

    const adjacentIds = graph.getAdjacentIds('a');

    assert.deepStrictEqual(Array.from(adjacentIds.values()), []);
});

test('getAdjacentIds() returns all connected ids for the requested node', () => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', ''],
            ['c', ''],
            ['d', ''],
            ['f', '']
        ],
        connections: [
            { from: 'a', to: 'b' },
            { from: 'a', to: 'c' },
            { from: 'a', to: 'd' },
            { from: 'b', to: 'f' }
        ]
    });

    const adjacentIds = graph.getAdjacentIds('a');

    assert.deepStrictEqual(Array.from(adjacentIds.values()), ['b', 'c', 'd']);
});

test('getAdjacentIds() throws when the requested node doesn’t exist', () => {
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
