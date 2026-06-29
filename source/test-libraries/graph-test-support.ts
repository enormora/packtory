import { createDirectedGraph, type DirectedGraph } from '../directed-graph/graph.ts';

export type GraphEdge<TId extends number | string> = Parameters<DirectedGraph<TId, unknown>['connect']>[0];

export type GraphWithNodesOptions = {
    readonly nodes: readonly (readonly [id: string, data: string])[];
    readonly connections: readonly GraphEdge<string>[];
};

export function createGraphWithNodes(options: GraphWithNodesOptions): DirectedGraph<string, string> {
    const { nodes, connections } = options;
    const graph = createDirectedGraph<string, string>();

    nodes.forEach(function ([ id, data ]) {
        graph.addNode(id, data);
    });

    connections.forEach(function (edge) {
        graph.connect(edge);
    });

    return graph;
}

export function collectFromGraph(graph: DirectedGraph<string, string>, startId: string): readonly string[] {
    const collected: string[] = [];

    graph.visitBreadthFirstSearch(startId, function (node) {
        collected.push(node.id);
    });

    return collected;
}
