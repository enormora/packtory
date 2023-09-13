import test from 'node:test';
import assert from 'node:assert';
import {createDirectedGraph, DirectedGraph} from './graph.js';

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
        graph.connect({from: 'a', to: 'b'});
        assert.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "a" does not exist');
    }
});

test('connect() throws when the from node doesn’t exist but the to node does', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('b', 'bar');

    try {
        graph.connect({from: 'a', to: 'b'});
        assert.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "a" does not exist');
    }
});

test('connect() throws when the to node doesn’t exist but the from node does', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');

    try {
        graph.connect({from: 'a', to: 'b'});
        assert.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "b" does not exist');
    }
});

test('connect() throws when both nodes exist but there is already a connection', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({from: 'a', to: 'b'});

    try {
        graph.connect({from: 'a', to: 'b'});
        assert.fail('Expected connect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Edge from "a" to "b" already exists');
    }
});

test('disconnect() throws when the from and to node don’t exist', () => {
    const graph = createDirectedGraph<string, string>();

    try {
        graph.disconnect({from: 'a', to: 'b'});
        assert.fail('Expected disconnect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "a" does not exist');
    }
});

test('disconnect() throws when the from node doesn’t exist but the to node does', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('b', 'bar');

    try {
        graph.disconnect({from: 'a', to: 'b'});
        assert.fail('Expected disconnect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Node with id "a" does not exist');
    }
});

test('disconnect() throws when the to node doesn’t exist but the from node does', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');

    try {
        graph.disconnect({from: 'a', to: 'b'});
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
        graph.disconnect({from: 'a', to: 'b'});
        assert.fail('Expected disconnect() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Edge from "a" to "b" does not exist');
    }
});

test('hasConnection() returns false when there is no connection for the given ids', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');

    assert.strictEqual(graph.hasConnection({from: 'a', to: 'b'}), false);
});

test('hasNode() returns true when there is a connection between the given nodes', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({from: 'a', to: 'b'});

    assert.strictEqual(graph.hasConnection({from: 'a', to: 'b'}), true);
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

function collectFromGraph(graph: DirectedGraph<string, string>, startId: string): string[] {
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

    assert.deepStrictEqual(collected, [ 'a' ]);
});

test('visits only the start node when there are multiple nodes but no connections', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.connect({from: 'b', to: 'c'});

    const collected = collectFromGraph(graph, 'a');

    assert.deepStrictEqual(collected, [ 'a' ]);
});

test('visits the start node and all connected nodes', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({from: 'a', to: 'b'});

    const collected = collectFromGraph(graph, 'a');

    assert.deepStrictEqual(collected, [ 'a', 'b' ]);
});

test('visits ONLY the start node when there are two nodes but the start node is not connected to ohter but the other is connected to the start node', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({from: 'b', to: 'a'});

    const collected = collectFromGraph(graph, 'a');

    assert.deepStrictEqual(collected, [ 'a' ]);
});

test('visits the start node and multiple connected nodes', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.connect({from: 'a', to: 'b'});
    graph.connect({from: 'a', to: 'c'});

    const collected = collectFromGraph(graph, 'a');

    assert.deepStrictEqual(collected, [ 'a', 'b', 'c' ]);
});

test('visits the start node and multiple connected nodes and their subsequent nodes', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.addNode('d', 'qux');
    graph.addNode('e', 'quux');
    graph.connect({from: 'a', to: 'b'});
    graph.connect({from: 'a', to: 'c'});
    graph.connect({from: 'b', to: 'd'});
    graph.connect({from: 'd', to: 'e'});

    const collected = collectFromGraph(graph, 'a');

    assert.deepStrictEqual(collected, [ 'a', 'b', 'c', 'd', 'e' ]);
});

test('visits only the nodes that are still connected after disconnecting some', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.addNode('d', 'qux');
    graph.addNode('e', 'quux');
    graph.connect({from: 'a', to: 'b'});
    graph.connect({from: 'a', to: 'c'});
    graph.connect({from: 'b', to: 'd'});
    graph.connect({from: 'd', to: 'e'});
    graph.disconnect({from: 'a', to: 'b'});

    const collected = collectFromGraph(graph, 'a');

    assert.deepStrictEqual(collected, [ 'a', 'c' ]);
});

test('visits the two nodes that are connected to each other', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({from: 'a', to: 'b'});
    graph.connect({from: 'b', to: 'a'});

    const collected = collectFromGraph(graph, 'a');

    assert.deepStrictEqual(collected, [ 'a', 'b' ]);
});

test('visits the three nodes which have a cyclic connection', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.connect({from: 'a', to: 'b'});
    graph.connect({from: 'b', to: 'c'});
    graph.connect({from: 'c', to: 'a'});

    const collected = collectFromGraph(graph, 'a');

    assert.deepStrictEqual(collected, [ 'a', 'b', 'c' ]);
});

test('visits ONYL the starting node when it is connected to itself', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.connect({from: 'a', to: 'a'});

    const collected = collectFromGraph(graph, 'a');

    assert.deepStrictEqual(collected, [ 'a' ]);
});

test('visits only the nodes that are connected with the starting id', () => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.connect({from: 'a', to: 'b'});
    graph.connect({from: 'b', to: 'c'});

    const collected = collectFromGraph(graph, 'b');

    assert.deepStrictEqual(collected, [ 'b', 'c' ]);
});
