import { createWorklist, type Worklist } from '../common/worklist.ts';

type GraphNodeId = number | string;

type GraphNode<TId extends GraphNodeId, TData> = {
    readonly id: TId;
    readonly data: TData;
    readonly adjacentNodeIds: ReadonlySet<TId>;
    readonly incomingEdges: number;
};
type NodeRegistryWriter<TId extends GraphNodeId, TData> = {
    readonly set: (id: TId, node: GraphNode<TId, TData>) => void;
};

type GraphEdge<TId extends GraphNodeId> = {
    readonly from: TId;
    readonly to: TId;
};

type Visitor<TId extends GraphNodeId, TData> = (node: Readonly<GraphNode<TId, TData>>) => void;

export type DirectedGraph<TId extends GraphNodeId, TData> = {
    addNode: (id: TId, data: TData) => void;
    connect: (edge: Readonly<GraphEdge<TId>>) => void;
    disconnect: (edge: Readonly<GraphEdge<TId>>) => void;
    hasNode: (id: TId) => boolean;
    hasConnection: (edge: Readonly<GraphEdge<TId>>) => boolean;
    visitBreadthFirstSearch: (startId: TId, visitor: Visitor<TId, TData>) => void;
    detectCycles: () => readonly (readonly TId[])[];
    isCyclic: () => boolean;
    getTopologicalGenerations: () => readonly (readonly TId[])[];
    reverse: () => DirectedGraph<TId, TData>;
    getAdjacentIds: (id: TId) => ReadonlySet<TId>;
    traverse: (visitor: Visitor<TId, TData>) => void;
};

function getNode<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    id: TId
): GraphNode<TId, TData> {
    const node = nodes.get(id);

    if (node === undefined) {
        throw new Error(`Node with id "${id}" does not exist`);
    }

    return node;
}

function detectCyclesForNode<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    baseNode: GraphNode<TId, TData>,
    visitedIds: readonly TId[]
): readonly (readonly TId[])[] {
    const newVisitedIds = [ ...visitedIds, baseNode.id ];
    const cycles: (readonly TId[])[] = [];

    for (const id of baseNode.adjacentNodeIds) {
        if (newVisitedIds.includes(id)) {
            cycles.push([ ...newVisitedIds, id ]);
        } else {
            cycles.push(...detectCyclesForNode(nodes, getNode(nodes, id), newVisitedIds));
        }
    }

    return cycles;
}

function detectCyclesForUnvisitedNode<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    idsWithinCycles: ReadonlySet<TId>,
    baseNode: GraphNode<TId, TData>
): readonly (readonly TId[])[] {
    if (idsWithinCycles.has(baseNode.id)) {
        return [];
    }

    return detectCyclesForNode(nodes, baseNode, []);
}

function detectGraphCycles<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>
): readonly (readonly TId[])[] {
    const cycles: (readonly TId[])[] = [];
    const idsWithinCycles = new Set<TId>();

    for (const baseNode of nodes.values()) {
        const cyclesForNode = detectCyclesForUnvisitedNode(nodes, idsWithinCycles, baseNode);
        cycles.push(...cyclesForNode);
        for (const id of cyclesForNode.flat()) {
            idsWithinCycles.add(id);
        }
    }

    return cycles;
}

type BreadthFirstSearchStep<TId extends GraphNodeId, TData> = {
    readonly head: GraphNode<TId, TData> | undefined;
    readonly visited: ReadonlySet<TId>;
};

type BreadthFirstSearchNodeVisit<TId extends GraphNodeId, TData> = {
    readonly head: GraphNode<TId, TData>;
    readonly nodes: ReadonlyMap<TId, GraphNode<TId, TData>>;
    readonly pendingNodes: Worklist<GraphNode<TId, TData>>;
    readonly visited: ReadonlySet<TId>;
    readonly visitor: Visitor<TId, TData>;
};
type BreadthFirstSearchState<TId extends GraphNodeId, TData> = {
    readonly head: GraphNode<TId, TData> | undefined;
    readonly pendingNodes: Worklist<GraphNode<TId, TData>>;
    readonly visited: ReadonlySet<TId>;
};

function scheduleAdjacentNodes<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    head: GraphNode<TId, TData>,
    pendingNodes: Worklist<GraphNode<TId, TData>>
): void {
    for (const id of head.adjacentNodeIds) {
        pendingNodes.schedule(getNode(nodes, id));
    }
}

function visitBreadthFirstSearchNode<TId extends GraphNodeId, TData>(
    visit: BreadthFirstSearchNodeVisit<TId, TData>
): BreadthFirstSearchStep<TId, TData> {
    if (visit.visited.has(visit.head.id)) {
        return { head: visit.pendingNodes.takeNext(), visited: visit.visited };
    }

    visit.visitor(visit.head);
    scheduleAdjacentNodes(visit.nodes, visit.head, visit.pendingNodes);
    return {
        head: visit.pendingNodes.takeNext(),
        visited: new Set([ ...visit.visited, visit.head.id ])
    };
}

function visitGraphBreadthFirstSearch<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    startId: TId,
    visitor: Visitor<TId, TData>
): void {
    const pendingNodes = createWorklist<GraphNode<TId, TData>>([]);
    let state: BreadthFirstSearchState<TId, TData> = {
        head: getNode(nodes, startId),
        pendingNodes,
        visited: new Set()
    };
    while (state.head !== undefined) {
        const nextStep: BreadthFirstSearchStep<TId, TData> = visitBreadthFirstSearchNode<TId, TData>({
            nodes,
            head: state.head,
            pendingNodes: state.pendingNodes,
            visited: state.visited,
            visitor
        });
        state = { ...state, head: nextStep.head, visited: nextStep.visited };
    }
}

function collectCurrentGeneration<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    alreadyDiscovered: ReadonlySet<TId>,
    incomingEdgesPerNode: ReadonlyMap<TId, number>
): readonly TId[] {
    const currentGeneration: TId[] = [];

    for (const node of nodes.values()) {
        if (!alreadyDiscovered.has(node.id) && incomingEdgesPerNode.get(node.id) === 0) {
            currentGeneration.push(node.id);
        }
    }

    return currentGeneration;
}

function getIncomingEdgesPerNode<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>
): Map<TId, number> {
    const incomingEdgesPerNode = new Map<TId, number>();

    for (const node of nodes.values()) {
        incomingEdgesPerNode.set(node.id, node.incomingEdges);
    }

    return incomingEdgesPerNode;
}

function decreaseIncomingEdgesPerNodeForAdjacentNodes<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    incomingEdgesPerNode: ReadonlyMap<TId, number>,
    ids: readonly TId[]
): Map<TId, number> {
    const newIncomingEdgesPerNode = new Map(incomingEdgesPerNode);

    for (const id of ids) {
        const node = getNode(nodes, id);

        for (const adjacentNodeId of node.adjacentNodeIds) {
            const degree = Number(newIncomingEdgesPerNode.get(adjacentNodeId));
            newIncomingEdgesPerNode.set(adjacentNodeId, degree - 1);
        }
    }

    return newIncomingEdgesPerNode;
}

function assertAcyclic<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>
): void {
    if (detectGraphCycles(nodes).length > 0) {
        throw new Error('Failed to determine topological generations, current graph is cyclic');
    }
}

function disconnectExistingEdge<TId extends GraphNodeId, TData>(
    nodes: NodeRegistryWriter<TId, TData>,
    fromNode: GraphNode<TId, TData>,
    toNode: GraphNode<TId, TData>
): void {
    const adjacentNodeIds = new Set(fromNode.adjacentNodeIds);
    adjacentNodeIds.delete(toNode.id);
    if (fromNode.id === toNode.id) {
        nodes.set(fromNode.id, {
            ...fromNode,
            adjacentNodeIds,
            incomingEdges: fromNode.incomingEdges - 1
        });
        return;
    }
    nodes.set(fromNode.id, { ...fromNode, adjacentNodeIds });
    nodes.set(toNode.id, { ...toNode, incomingEdges: toNode.incomingEdges - 1 });
}

function updateTopologicalDiscovery<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    incomingEdgesPerNode: ReadonlyMap<TId, number>,
    currentGeneration: readonly TId[]
): Map<TId, number> {
    return decreaseIncomingEdgesPerNodeForAdjacentNodes(nodes, incomingEdgesPerNode, Array.from(currentGeneration));
}

function collectTopologicalGenerationsFromAcyclicGraph<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>
): readonly (readonly TId[])[] {
    let alreadyDiscovered: ReadonlySet<TId> = new Set();
    const generations: (readonly TId[])[] = [];
    let incomingEdgesPerNode: ReadonlyMap<TId, number> = getIncomingEdgesPerNode(nodes);

    while (alreadyDiscovered.size < nodes.size) {
        const currentGeneration = collectCurrentGeneration(nodes, alreadyDiscovered, incomingEdgesPerNode);
        generations.push(Array.from(currentGeneration));
        alreadyDiscovered = new Set([ ...alreadyDiscovered, ...currentGeneration ]);
        incomingEdgesPerNode = updateTopologicalDiscovery(nodes, incomingEdgesPerNode, currentGeneration);
    }

    return generations;
}

function collectTopologicalGenerations<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>
): readonly (readonly TId[])[] {
    assertAcyclic(nodes);
    return collectTopologicalGenerationsFromAcyclicGraph(nodes);
}

export function createDirectedGraph<TId extends GraphNodeId, TData>(): DirectedGraph<TId, TData> {
    const nodes = new Map<TId, GraphNode<TId, TData>>();

    return {
        addNode(id, data) {
            if (nodes.has(id)) {
                throw new Error(`Node with id "${id}" already exists`);
            }
            nodes.set(id, { id, data, adjacentNodeIds: new Set(), incomingEdges: 0 });
        },
        connect(edge) {
            const fromNode = getNode(nodes, edge.from);
            const toNode = getNode(nodes, edge.to);
            if (fromNode.adjacentNodeIds.has(toNode.id)) {
                throw new Error(`Edge from "${edge.from}" to "${toNode.id}" already exists`);
            }
            if (fromNode.id === toNode.id) {
                nodes.set(fromNode.id, {
                    ...fromNode,
                    adjacentNodeIds: new Set([ ...fromNode.adjacentNodeIds, toNode.id ]),
                    incomingEdges: fromNode.incomingEdges + 1
                });
                return;
            }
            nodes.set(fromNode.id, {
                ...fromNode,
                adjacentNodeIds: new Set([ ...fromNode.adjacentNodeIds, toNode.id ])
            });
            nodes.set(toNode.id, { ...toNode, incomingEdges: toNode.incomingEdges + 1 });
        },
        disconnect(edge) {
            const fromNode = getNode(nodes, edge.from);
            const toNode = getNode(nodes, edge.to);
            if (!fromNode.adjacentNodeIds.has(toNode.id)) {
                throw new Error(`Edge from "${edge.from}" to "${toNode.id}" does not exist`);
            }
            disconnectExistingEdge(nodes, fromNode, toNode);
        },
        hasNode(id) {
            return nodes.has(id);
        },
        hasConnection(edge) {
            return getNode(nodes, edge.from).adjacentNodeIds.has(edge.to);
        },
        visitBreadthFirstSearch(startId, visitor) {
            visitGraphBreadthFirstSearch(nodes, startId, visitor);
        },
        detectCycles() {
            return detectGraphCycles(nodes);
        },
        isCyclic() {
            return detectGraphCycles(nodes).length > 0;
        },
        getTopologicalGenerations() {
            return collectTopologicalGenerations(nodes);
        },
        reverse() {
            const reversedGraph = createDirectedGraph<TId, TData>();
            for (const node of nodes.values()) {
                reversedGraph.addNode(node.id, node.data);
            }
            for (const node of nodes.values()) {
                for (const adjacentNodeId of node.adjacentNodeIds) {
                    reversedGraph.connect({ from: adjacentNodeId, to: node.id });
                }
            }
            return reversedGraph;
        },
        getAdjacentIds(id) {
            return getNode(nodes, id).adjacentNodeIds;
        },
        traverse(visitor) {
            for (const [ nodeId, node ] of nodes) {
                if (node.incomingEdges === 0) {
                    visitGraphBreadthFirstSearch(nodes, nodeId, visitor);
                }
            }
        }
    };
}
