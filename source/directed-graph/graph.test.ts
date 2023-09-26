import test from 'ava';
import { createDirectedGraph, DirectedGraph } from './graph.js';

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

function collectFromGraph(graph: DirectedGraph<string, string>, startId: string): string[] {
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

test('visits only the start node when there are multiple nodes but no connections', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.connect({ from: 'b', to: 'c' });

    const collected = collectFromGraph(graph, 'a');

    t.deepEqual(collected, ['a']);
});

test('visits the start node and all connected nodes', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({ from: 'a', to: 'b' });

    const collected = collectFromGraph(graph, 'a');

    t.deepEqual(collected, ['a', 'b']);
});

test('visits ONLY the start node when there are two nodes but the start node is not connected to ohter but the other is connected to the start node', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({ from: 'b', to: 'a' });

    const collected = collectFromGraph(graph, 'a');

    t.deepEqual(collected, ['a']);
});

test('visits the start node and multiple connected nodes', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.connect({ from: 'a', to: 'b' });
    graph.connect({ from: 'a', to: 'c' });

    const collected = collectFromGraph(graph, 'a');

    t.deepEqual(collected, ['a', 'b', 'c']);
});

test('visits the start node and multiple connected nodes and their subsequent nodes', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.addNode('d', 'qux');
    graph.addNode('e', 'quux');
    graph.connect({ from: 'a', to: 'b' });
    graph.connect({ from: 'a', to: 'c' });
    graph.connect({ from: 'b', to: 'd' });
    graph.connect({ from: 'd', to: 'e' });

    const collected = collectFromGraph(graph, 'a');

    t.deepEqual(collected, ['a', 'b', 'c', 'd', 'e']);
});

test('visits only the nodes that are still connected after disconnecting some', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.addNode('d', 'qux');
    graph.addNode('e', 'quux');
    graph.connect({ from: 'a', to: 'b' });
    graph.connect({ from: 'a', to: 'c' });
    graph.connect({ from: 'b', to: 'd' });
    graph.connect({ from: 'd', to: 'e' });
    graph.disconnect({ from: 'a', to: 'b' });

    const collected = collectFromGraph(graph, 'a');

    t.deepEqual(collected, ['a', 'c']);
});

test('visits the two nodes that are connected to each other', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.connect({ from: 'a', to: 'b' });
    graph.connect({ from: 'b', to: 'a' });

    const collected = collectFromGraph(graph, 'a');

    t.deepEqual(collected, ['a', 'b']);
});

test('visits the three nodes which have a cyclic connection', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.connect({ from: 'a', to: 'b' });
    graph.connect({ from: 'b', to: 'c' });
    graph.connect({ from: 'c', to: 'a' });

    const collected = collectFromGraph(graph, 'a');

    t.deepEqual(collected, ['a', 'b', 'c']);
});

test('visits ONYL the starting node when it is connected to itself', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.connect({ from: 'a', to: 'a' });

    const collected = collectFromGraph(graph, 'a');

    t.deepEqual(collected, ['a']);
});

test('visits only the nodes that are connected with the starting id', (t) => {
    const graph = createDirectedGraph<string, string>();

    graph.addNode('a', 'foo');
    graph.addNode('b', 'bar');
    graph.addNode('c', 'baz');
    graph.connect({ from: 'a', to: 'b' });
    graph.connect({ from: 'b', to: 'c' });

    const collected = collectFromGraph(graph, 'b');

    t.deepEqual(collected, ['b', 'c']);
});
