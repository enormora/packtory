import test from 'ava';
import { createDirectedGraph, type GraphEdge, type DirectedGraph } from './graph.js';

test('hasNode() returns false when there is no node for the given id', (t) => {
    const graph = createDirectedGraph<string, string>();
    t.is(graph.hasNode('foo'), false);
});

test('hasNode() returns true when there is a node for the given id', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('foo', 'bar');

    t.is(graph.hasNode('foo'), true);
});

test('addNode() throws when adding a node with an id that already exist', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('foo', 'bar');

    try {
        graph.addNode('foo', 'baz');
        t.fail('Expected addNode() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Node with id "foo" already exists');
    }
});

test('connect() throws when the from and to node don’t exist', (t) => {
    const graph = createDirectedGraph<string, string>();

    try {
        graph.connect({ from: 'a', to: 'b' });
        t.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Node with id "a" does not exist');
    }
});

test('connect() throws when the from node doesn’t exist but the to node does', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('b', 'bar');

    try {
        graph.connect({ from: 'a', to: 'b' });
        t.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Node with id "a" does not exist');
    }
});

test('connect() throws when the to node doesn’t exist but the from node does', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');

    try {
        graph.connect({ from: 'a', to: 'b' });
        t.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Node with id "b" does not exist');
    }
});

test('connect() throws when both nodes exist but there is already a connection', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({ from: 'a', to: 'b' });

    try {
        graph.connect({ from: 'a', to: 'b' });
        t.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Edge from "a" to "b" already exists');
    }
});

test('disconnect() throws when the from and to node don’t exist', (t) => {
    const graph = createDirectedGraph<string, string>();

    try {
        graph.disconnect({ from: 'a', to: 'b' });
        t.fail('Expected disconnect() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Node with id "a" does not exist');
    }
});

test('disconnect() throws when the from node doesn’t exist but the to node does', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('b', 'bar');

    try {
        graph.disconnect({ from: 'a', to: 'b' });
        t.fail('Expected disconnect() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Node with id "a" does not exist');
    }
});

test('disconnect() throws when the to node doesn’t exist but the from node does', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');

    try {
        graph.disconnect({ from: 'a', to: 'b' });
        t.fail('Expected disconnect() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Node with id "b" does not exist');
    }
});

test('disconnect() throws when both nodes exist but there is no connection', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');

    try {
        graph.disconnect({ from: 'a', to: 'b' });
        t.fail('Expected disconnect() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Edge from "a" to "b" does not exist');
    }
});

test('hasConnection() returns false when there is no connection for the given ids', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');

    t.is(graph.hasConnection({ from: 'a', to: 'b' }), false);
});

test('hasNode() returns true when there is a connection between the given nodes', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({ from: 'a', to: 'b' });

    t.is(graph.hasConnection({ from: 'a', to: 'b' }), true);
});

function collectFromGraph(graph: DirectedGraph<string, string>, startId: string): readonly string[] {
    const collected: string[] = [];

    graph.visitBreadthFirstSearch(startId, (node) => {
        collected.push(node.id);
    });

    return collected;
}

test('throws when there is no node for the given start id', (t) => {
    const graph = createDirectedGraph<string, string>();

    try {
        collectFromGraph(graph, 'foo');
        t.fail('Expected visitBreadthFirstSearch() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Node with id "foo" does not exist');
    }
});

test('visits the start node first', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');

    const collected = collectFromGraph(graph, 'a');

    t.deepEqual(collected, ['a']);
});

type GraphWithNodesOptions = {
    readonly nodes: [id: string, data: string][];
    readonly connections: GraphEdge<string>[];
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

const checkNodeVisiting = test.macro((t, testCase: Readonly<NodeVisitingTestCase>) => {
    const { nodes, connections, disconnections = [], expectedCollectedIds, startId } = testCase;
    const graph = createGraphWithNodes({ nodes, connections });

    disconnections.forEach((edge) => {
        graph.disconnect(edge);
    });

    const collected = collectFromGraph(graph, startId);

    t.deepEqual(collected, expectedCollectedIds);
});

test('visits only the start node when there are multiple nodes but no connections', checkNodeVisiting, {
    nodes: [
        ['a', 'foo'],
        ['b', 'bar'],
        ['c', 'baz']
    ],
    connections: [{ from: 'b', to: 'c' }],
    startId: 'a',
    expectedCollectedIds: ['a']
});

test('visits the start node and all connected nodes', checkNodeVisiting, {
    nodes: [
        ['a', 'foo'],
        ['b', 'bar']
    ],
    connections: [{ from: 'a', to: 'b' }],
    startId: 'a',
    expectedCollectedIds: ['a', 'b']
});

test(
    'visits ONLY the start node when there are two nodes but the start node is not connected to other but the other is connected to the start node',
    checkNodeVisiting,
    {
        nodes: [
            ['a', 'foo'],
            ['b', 'bar']
        ],
        connections: [{ from: 'b', to: 'a' }],
        startId: 'a',
        expectedCollectedIds: ['a']
    }
);

test('visits the start node and multiple connected nodes', checkNodeVisiting, {
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
});

test('visits the start node and multiple connected nodes and their subsequent nodes', checkNodeVisiting, {
    nodes: [
        ['a', 'foo'],
        ['b', 'bar'],
        ['c', 'baz'],
        ['d', 'qux'],
        ['e', 'quux']
    ],
    connections: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'd', to: 'e' }
    ],
    startId: 'a',
    expectedCollectedIds: ['a', 'b', 'c', 'd', 'e']
});

test('visits only the nodes that are still connected after disconnecting some', checkNodeVisiting, {
    nodes: [
        ['a', 'foo'],
        ['b', 'bar'],
        ['c', 'baz'],
        ['d', 'qux'],
        ['e', 'quux']
    ],
    connections: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'd', to: 'e' }
    ],
    disconnections: [{ from: 'a', to: 'b' }],
    startId: 'a',
    expectedCollectedIds: ['a', 'c']
});

test('visits the two nodes that are connected to each other', checkNodeVisiting, {
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
});

test('visits the three nodes which have a cyclic connection', checkNodeVisiting, {
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
});

test('visits ONLY the starting node when it is connected to itself', checkNodeVisiting, {
    nodes: [['a', 'foo']],
    connections: [{ from: 'a', to: 'a' }],
    startId: 'a',
    expectedCollectedIds: ['a']
});

test('visits only the nodes that are connected with the starting id', checkNodeVisiting, {
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
});

test('detectCycles() returns an empty array for an empty graph', (t) => {
    const graph = createDirectedGraph<string, string>();

    t.deepEqual(graph.detectCycles(), []);
});

test('detectCycles() returns an empty array for a non-cyclic graph', (t) => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', 'foo'],
            ['b', 'bar']
        ],
        connections: [{ from: 'a', to: 'b' }]
    });

    t.deepEqual(graph.detectCycles(), []);
});

test('detectCycles() returns the detected cycle when a node is referencing itself', (t) => {
    const graph = createGraphWithNodes({
        nodes: [['a', 'foo']],
        connections: [{ from: 'a', to: 'a' }]
    });

    t.deepEqual(graph.detectCycles(), [['a', 'a']]);
});

test('detectCycles() returns the detected cycle when a node is indirectly referencing itself', (t) => {
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

    t.deepEqual(graph.detectCycles(), [['a', 'b', 'a']]);
});

test('detectCycles() detects multiple cycles in the same root node', (t) => {
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

    t.deepEqual(graph.detectCycles(), [
        ['a', 'b', 'a'],
        ['a', 'b', 'c', 'd', 'c']
    ]);
});

test('detectCycles() detects multiple cycles which are not connected', (t) => {
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

    t.deepEqual(graph.detectCycles(), [
        ['a', 'b', 'a'],
        ['c', 'c']
    ]);
});

test('isCyclic() returns true when there is one cycle in the graph', (t) => {
    const graph = createGraphWithNodes({
        nodes: [['a', '']],
        connections: [{ from: 'a', to: 'a' }]
    });

    t.is(graph.isCyclic(), true);
});

test('isCyclic() returns false when there is no cycle in the graph', (t) => {
    const graph = createGraphWithNodes({
        nodes: [
            ['a', ''],
            ['b', '']
        ],
        connections: [{ from: 'a', to: 'b' }]
    });

    t.is(graph.isCyclic(), false);
});
