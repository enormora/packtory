import { createDirectedGraph, type DirectedGraph } from '../directed-graph/graph.ts';

export type GraphEdge<TIdentifier extends number | string> = Parameters<
    DirectedGraph<TIdentifier, unknown>['connect']
>[0];

export type GraphWithNodesOptions = {
    readonly nodes: readonly (readonly [identifier: string, data: string])[];
    readonly connections: readonly GraphEdge<string>[];
};

export function createGraphWithNodes(options: GraphWithNodesOptions): DirectedGraph<string, string> {
    const { nodes, connections } = options;
    const graph = createDirectedGraph<string, string>();

    nodes.forEach(function ([ identifier, data ]) {
        graph.addNode(identifier, data);
    });

    connections.forEach(function (edge) {
        graph.connect(edge);
    });

    return graph;
}

export function collectFromGraph(graph: DirectedGraph<string, string>, startIdentifier: string): readonly string[] {
    const collected: string[] = [];

    graph.visitBreadthFirstSearch(startIdentifier, function (node) {
        collected.push(node.identifier);
    });

    return collected;
}
