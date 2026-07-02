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

type GraphDependencies<TId extends GraphNodeId> = {
    readonly cyclePathIncludes: (visitedIds: readonly TId[], id: TId) => boolean;
    readonly mergeDiscovered: (
        alreadyDiscovered: ReadonlySet<TId>,
        currentGeneration: readonly TId[]
    ) => ReadonlySet<TId>;
    readonly visitedHas: (visited: ReadonlySet<TId>, id: TId) => boolean;
};

function attemptSlots(length: number): readonly unknown[] {
    return Array.from({ length });
}

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

function createGraphDependencies<TId extends GraphNodeId>(
    dependencies: Partial<GraphDependencies<TId>>
): GraphDependencies<TId> {
    return {
        cyclePathIncludes(visitedIds, id) {
            return visitedIds.includes(id);
        },
        mergeDiscovered(alreadyDiscovered, currentGeneration) {
            return new Set([ ...alreadyDiscovered, ...currentGeneration ]);
        },
        visitedHas(visited, id) {
            return visited.has(id);
        },
        ...dependencies
    };
}

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
    dependencies: GraphDependencies<TId>,
    baseNode: GraphNode<TId, TData>,
    visitedIds: readonly TId[]
): readonly (readonly TId[])[] {
    if (visitedIds.length === nodes.size + 1) {
        throw new Error('Cycle detection exceeded the maximum traversal depth');
    }

    const newVisitedIds = [ ...visitedIds, baseNode.id ];
    const cycles: (readonly TId[])[] = [];

    for (const id of baseNode.adjacentNodeIds) {
        if (dependencies.cyclePathIncludes(newVisitedIds, id)) {
            cycles.push([ ...newVisitedIds, id ]);
        } else {
            cycles.push(...detectCyclesForNode(nodes, dependencies, getNode(nodes, id), newVisitedIds));
        }
    }

    return cycles;
}

function detectGraphCycles<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    dependencies: GraphDependencies<TId>
): readonly (readonly TId[])[] {
    const cycles: (readonly TId[])[] = [];
    const idsWithinCycles = new Set<TId>();

    for (const baseNode of nodes.values()) {
        if (!dependencies.visitedHas(idsWithinCycles, baseNode.id)) {
            const cyclesForNode = detectCyclesForNode(nodes, dependencies, baseNode, []);
            cycles.push(...cyclesForNode);
            for (const id of cyclesForNode.flat()) {
                idsWithinCycles.add(id);
            }
        }
    }

    return cycles;
}

function countEdges<TId extends GraphNodeId, TData>(nodes: ReadonlyMap<TId, GraphNode<TId, TData>>): number {
    return Array.from(nodes.values()).reduce(function (edgeCount, node) {
        return edgeCount + node.adjacentNodeIds.size;
    }, 0);
}

type BreadthFirstSearchStep<TId extends GraphNodeId, TData> = {
    readonly head: GraphNode<TId, TData> | undefined;
    readonly visited: ReadonlySet<TId>;
};

type BreadthFirstSearchNodeVisit<TId extends GraphNodeId, TData> = {
    readonly dependencies: GraphDependencies<TId>;
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
    if (visit.dependencies.visitedHas(visit.visited, visit.head.id)) {
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
    dependencies: GraphDependencies<TId>,
    startId: TId,
    visitor: Visitor<TId, TData>
): void {
    const pendingNodes = createWorklist<GraphNode<TId, TData>>([]);
    const maximumSteps = nodes.size + countEdges(nodes) + 1;
    let state: BreadthFirstSearchState<TId, TData> = {
        head: getNode(nodes, startId),
        pendingNodes,
        visited: new Set()
    };
    const completed = attemptSlots(maximumSteps).some(function () {
        if (state.head === undefined) {
            return true;
        }

        const nextStep: BreadthFirstSearchStep<TId, TData> = visitBreadthFirstSearchNode<TId, TData>({
            nodes,
            dependencies,
            head: state.head,
            pendingNodes: state.pendingNodes,
            visited: state.visited,
            visitor
        });
        state = { ...state, head: nextStep.head, visited: nextStep.visited };
        return false;
    });
    if (completed) {
        return;
    }

    throw new Error(`Breadth-first traversal exceeded ${maximumSteps} attempts`);
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
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    dependencies: GraphDependencies<TId>
): void {
    if (detectGraphCycles(nodes, dependencies).length > 0) {
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

type TopologicalDiscovery<TId extends GraphNodeId> = {
    readonly alreadyDiscovered: ReadonlySet<TId>;
    readonly generations: readonly (readonly TId[])[];
    readonly incomingEdgesPerNode: ReadonlyMap<TId, number>;
};
type PendingDiscovery<TId extends GraphNodeId> = {
    readonly type: 'pending';
    readonly discovery: TopologicalDiscovery<TId>;
};
type FinishedDiscovery<TId extends GraphNodeId> = {
    readonly type: 'finished';
    readonly generations: readonly (readonly TId[])[];
};
type DiscoveryState<TId extends GraphNodeId> = FinishedDiscovery<TId> | PendingDiscovery<TId>;

function createTopologicalDiscovery<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>
): TopologicalDiscovery<TId> {
    return {
        alreadyDiscovered: new Set(),
        generations: [],
        incomingEdgesPerNode: getIncomingEdgesPerNode(nodes)
    };
}

function advanceTopologicalDiscovery<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    dependencies: GraphDependencies<TId>,
    discovery: TopologicalDiscovery<TId>,
    currentGeneration: readonly TId[]
): TopologicalDiscovery<TId> {
    return {
        alreadyDiscovered: dependencies.mergeDiscovered(discovery.alreadyDiscovered, currentGeneration),
        generations: [ ...discovery.generations, Array.from(currentGeneration) ],
        incomingEdgesPerNode: updateTopologicalDiscovery(nodes, discovery.incomingEdgesPerNode, currentGeneration)
    };
}

function collectTopologicalGenerations<TId extends GraphNodeId, TData>(
    nodes: ReadonlyMap<TId, GraphNode<TId, TData>>,
    dependencies: GraphDependencies<TId>
): readonly (readonly TId[])[] {
    assertAcyclic(nodes, dependencies);

    const maximumGenerations = nodes.size + 1;
    const finalDiscovery = attemptSlots(maximumGenerations).reduce<DiscoveryState<TId>>(function (state) {
        if (state.type !== 'pending') {
            return state;
        }
        const currentGeneration = collectCurrentGeneration(
            nodes,
            state.discovery.alreadyDiscovered,
            state.discovery.incomingEdgesPerNode
        );
        if (currentGeneration.length === 0) {
            return { type: 'finished', generations: state.discovery.generations };
        }
        return {
            type: 'pending',
            discovery: advanceTopologicalDiscovery(nodes, dependencies, state.discovery, currentGeneration)
        };
    }, { type: 'pending', discovery: createTopologicalDiscovery(nodes) });
    if (finalDiscovery.type === 'finished') {
        return finalDiscovery.generations;
    }

    throw new Error(`Topological generation discovery did not make progress after ${maximumGenerations} attempts`);
}

export function createDirectedGraph<TId extends GraphNodeId, TData>(
    dependencies: Partial<GraphDependencies<TId>> = {}
): DirectedGraph<TId, TData> {
    const resolvedDependencies = createGraphDependencies(dependencies);
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
            visitGraphBreadthFirstSearch(nodes, resolvedDependencies, startId, visitor);
        },
        detectCycles() {
            return detectGraphCycles(nodes, resolvedDependencies);
        },
        isCyclic() {
            return detectGraphCycles(nodes, resolvedDependencies).length > 0;
        },
        getTopologicalGenerations() {
            return collectTopologicalGenerations(nodes, resolvedDependencies);
        },
        reverse() {
            const reversedGraph = createDirectedGraph<TId, TData>(resolvedDependencies);
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
                    visitGraphBreadthFirstSearch(nodes, resolvedDependencies, nodeId, visitor);
                }
            }
        }
    };
}
