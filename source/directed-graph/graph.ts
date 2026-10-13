import { createWorklist, type Worklist } from '../common/worklist.ts';

type GraphNodeIdentifier = number | string;

type GraphNode<TIdentifier extends GraphNodeIdentifier, TData> = {
    readonly identifier: TIdentifier;
    readonly data: TData;
    readonly adjacentNodeIdentifiers: ReadonlySet<TIdentifier>;
    readonly incomingEdges: number;
};
type NodeRegistryWriter<TIdentifier extends GraphNodeIdentifier, TData> = {
    readonly set: (identifier: TIdentifier, node: GraphNode<TIdentifier, TData>) => void;
};

type GraphEdge<TIdentifier extends GraphNodeIdentifier> = {
    readonly from: TIdentifier;
    readonly to: TIdentifier;
};

type Visitor<TIdentifier extends GraphNodeIdentifier, TData> = (node: Readonly<GraphNode<TIdentifier, TData>>) => void;

function attemptSlots(length: number): readonly unknown[] {
    return Array.from({ length });
}

export type DirectedGraph<TIdentifier extends GraphNodeIdentifier, TData> = {
    addNode: (identifier: TIdentifier, data: TData) => void;
    connect: (edge: Readonly<GraphEdge<TIdentifier>>) => void;
    disconnect: (edge: Readonly<GraphEdge<TIdentifier>>) => void;
    hasNode: (identifier: TIdentifier) => boolean;
    hasConnection: (edge: Readonly<GraphEdge<TIdentifier>>) => boolean;
    visitBreadthFirstSearch: (startIdentifier: TIdentifier, visitor: Visitor<TIdentifier, TData>) => void;
    detectCycles: () => readonly (readonly TIdentifier[])[];
    isCyclic: () => boolean;
    getTopologicalGenerations: () => readonly (readonly TIdentifier[])[];
    reverse: () => DirectedGraph<TIdentifier, TData>;
    getAdjacentIdentifiers: (identifier: TIdentifier) => ReadonlySet<TIdentifier>;
    traverse: (visitor: Visitor<TIdentifier, TData>) => void;
};

function getNode<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>,
    identifier: TIdentifier
): GraphNode<TIdentifier, TData> {
    const node = nodes.get(identifier);

    if (node === undefined) {
        throw new Error(`Node with id "${identifier}" does not exist`);
    }

    return node;
}

function detectCyclesForNode<TIdentifier extends GraphNodeIdentifier, TData>(
    remainingNodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>,
    baseNode: GraphNode<TIdentifier, TData>,
    visitedIdentifiers: readonly TIdentifier[]
): readonly (readonly TIdentifier[])[] {
    const newVisitedIdentifiers = [ ...visitedIdentifiers, baseNode.identifier ];
    const newRemainingNodes = new Map(remainingNodes);
    newRemainingNodes.delete(baseNode.identifier);
    return Array.from(baseNode.adjacentNodeIdentifiers).flatMap(function (identifier) {
        const adjacentNode = newRemainingNodes.get(identifier);
        return adjacentNode === undefined
            ? [ [ ...newVisitedIdentifiers, identifier ] ]
            : detectCyclesForNode(newRemainingNodes, adjacentNode, newVisitedIdentifiers);
    });
}

function detectCyclesForUnvisitedNode<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>,
    identifiersWithinCycles: ReadonlySet<TIdentifier>,
    baseNode: GraphNode<TIdentifier, TData>
): readonly (readonly TIdentifier[])[] {
    if (identifiersWithinCycles.has(baseNode.identifier)) {
        return [];
    }

    return detectCyclesForNode(nodes, baseNode, []);
}

function detectGraphCycles<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>
): readonly (readonly TIdentifier[])[] {
    const cycles: (readonly TIdentifier[])[] = [];
    const identifiersWithinCycles = new Set<TIdentifier>();

    for (const baseNode of nodes.values()) {
        const cyclesForNode = detectCyclesForUnvisitedNode(nodes, identifiersWithinCycles, baseNode);
        cycles.push(...cyclesForNode);
        for (const identifier of cyclesForNode.flat()) {
            identifiersWithinCycles.add(identifier);
        }
    }

    return cycles;
}

function countEdges<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>
): number {
    return Array.from(nodes.values()).reduce(function (edgeCount, node) {
        return edgeCount + node.adjacentNodeIdentifiers.size;
    }, 0);
}

type BreadthFirstSearchStep<TIdentifier extends GraphNodeIdentifier, TData> = {
    readonly head: GraphNode<TIdentifier, TData> | undefined;
    readonly visited: ReadonlySet<TIdentifier>;
};

type BreadthFirstSearchNodeVisit<TIdentifier extends GraphNodeIdentifier, TData> = {
    readonly head: GraphNode<TIdentifier, TData>;
    readonly nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>;
    readonly pendingNodes: Worklist<GraphNode<TIdentifier, TData>>;
    readonly visited: ReadonlySet<TIdentifier>;
    readonly visitor: Visitor<TIdentifier, TData>;
};
type BreadthFirstSearchState<TIdentifier extends GraphNodeIdentifier, TData> = {
    readonly head: GraphNode<TIdentifier, TData> | undefined;
    readonly pendingNodes: Worklist<GraphNode<TIdentifier, TData>>;
    readonly visited: ReadonlySet<TIdentifier>;
};

function scheduleAdjacentNodes<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>,
    head: GraphNode<TIdentifier, TData>,
    pendingNodes: Worklist<GraphNode<TIdentifier, TData>>
): void {
    for (const identifier of head.adjacentNodeIdentifiers) {
        pendingNodes.schedule(getNode(nodes, identifier));
    }
}

function visitBreadthFirstSearchNode<TIdentifier extends GraphNodeIdentifier, TData>(
    visit: BreadthFirstSearchNodeVisit<TIdentifier, TData>
): BreadthFirstSearchStep<TIdentifier, TData> {
    if (visit.visited.has(visit.head.identifier)) {
        return { head: visit.pendingNodes.takeNext(), visited: visit.visited };
    }

    visit.visitor(visit.head);
    scheduleAdjacentNodes(visit.nodes, visit.head, visit.pendingNodes);
    return {
        head: visit.pendingNodes.takeNext(),
        visited: new Set([ ...visit.visited, visit.head.identifier ])
    };
}

function visitGraphBreadthFirstSearch<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>,
    startIdentifier: TIdentifier,
    visitor: Visitor<TIdentifier, TData>
): void {
    const pendingNodes = createWorklist<GraphNode<TIdentifier, TData>>([]);
    const traversalSlots = attemptSlots(nodes.size + countEdges(nodes) + 1);
    let state: BreadthFirstSearchState<TIdentifier, TData> = {
        head: getNode(nodes, startIdentifier),
        pendingNodes,
        visited: new Set()
    };

    traversalSlots.forEach(function () {
        if (state.head === undefined) {
            return;
        }

        const nextStep: BreadthFirstSearchStep<TIdentifier, TData> = visitBreadthFirstSearchNode<TIdentifier, TData>({
            nodes,
            head: state.head,
            pendingNodes: state.pendingNodes,
            visited: state.visited,
            visitor
        });
        state = { ...state, head: nextStep.head, visited: nextStep.visited };
    });
}

function collectCurrentGeneration<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>,
    alreadyDiscovered: ReadonlySet<TIdentifier>,
    incomingEdgesPerNode: ReadonlyMap<TIdentifier, number>
): readonly TIdentifier[] {
    const currentGeneration: TIdentifier[] = [];

    for (const node of nodes.values()) {
        if (!alreadyDiscovered.has(node.identifier) && incomingEdgesPerNode.get(node.identifier) === 0) {
            currentGeneration.push(node.identifier);
        }
    }

    return currentGeneration;
}

function getIncomingEdgesPerNode<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>
): Map<TIdentifier, number> {
    const incomingEdgesPerNode = new Map<TIdentifier, number>();

    for (const node of nodes.values()) {
        incomingEdgesPerNode.set(node.identifier, node.incomingEdges);
    }

    return incomingEdgesPerNode;
}

function decreaseIncomingEdgesPerNodeForAdjacentNodes<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>,
    incomingEdgesPerNode: ReadonlyMap<TIdentifier, number>,
    identifiers: readonly TIdentifier[]
): Map<TIdentifier, number> {
    const newIncomingEdgesPerNode = new Map(incomingEdgesPerNode);

    for (const identifier of identifiers) {
        const node = getNode(nodes, identifier);

        for (const adjacentNodeIdentifier of node.adjacentNodeIdentifiers) {
            const degree = Number(newIncomingEdgesPerNode.get(adjacentNodeIdentifier));
            newIncomingEdgesPerNode.set(adjacentNodeIdentifier, degree - 1);
        }
    }

    return newIncomingEdgesPerNode;
}

function assertAcyclic<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>
): void {
    if (detectGraphCycles(nodes).length > 0) {
        throw new Error('Failed to determine topological generations, current graph is cyclic');
    }
}

function disconnectExistingEdge<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: NodeRegistryWriter<TIdentifier, TData>,
    fromNode: GraphNode<TIdentifier, TData>,
    toNode: GraphNode<TIdentifier, TData>
): void {
    const adjacentNodeIdentifiers = new Set(fromNode.adjacentNodeIdentifiers);
    adjacentNodeIdentifiers.delete(toNode.identifier);
    if (fromNode.identifier === toNode.identifier) {
        nodes.set(fromNode.identifier, {
            ...fromNode,
            adjacentNodeIdentifiers,
            incomingEdges: fromNode.incomingEdges - 1
        });
        return;
    }
    nodes.set(fromNode.identifier, { ...fromNode, adjacentNodeIdentifiers });
    nodes.set(toNode.identifier, { ...toNode, incomingEdges: toNode.incomingEdges - 1 });
}

function updateTopologicalDiscovery<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>,
    incomingEdgesPerNode: ReadonlyMap<TIdentifier, number>,
    currentGeneration: readonly TIdentifier[]
): Map<TIdentifier, number> {
    return decreaseIncomingEdgesPerNodeForAdjacentNodes(nodes, incomingEdgesPerNode, Array.from(currentGeneration));
}

type TopologicalDiscovery<TIdentifier extends GraphNodeIdentifier> = {
    readonly alreadyDiscovered: ReadonlySet<TIdentifier>;
    readonly generations: readonly (readonly TIdentifier[])[];
    readonly incomingEdgesPerNode: ReadonlyMap<TIdentifier, number>;
};

function createTopologicalDiscovery<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>
): TopologicalDiscovery<TIdentifier> {
    return {
        alreadyDiscovered: new Set(),
        generations: [],
        incomingEdgesPerNode: getIncomingEdgesPerNode(nodes)
    };
}

function advanceTopologicalDiscovery<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>,
    discovery: TopologicalDiscovery<TIdentifier>
): TopologicalDiscovery<TIdentifier> {
    if (discovery.alreadyDiscovered.size === nodes.size) {
        return discovery;
    }

    const currentGeneration = collectCurrentGeneration(
        nodes,
        discovery.alreadyDiscovered,
        discovery.incomingEdgesPerNode
    );
    return {
        alreadyDiscovered: new Set([ ...discovery.alreadyDiscovered, ...currentGeneration ]),
        generations: [ ...discovery.generations, Array.from(currentGeneration) ],
        incomingEdgesPerNode: updateTopologicalDiscovery(nodes, discovery.incomingEdgesPerNode, currentGeneration)
    };
}

function collectTopologicalGenerationsFromAcyclicGraph<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>
): readonly (readonly TIdentifier[])[] {
    return attemptSlots(nodes.size)
        .reduce<TopologicalDiscovery<TIdentifier>>(
            function (discovery) {
                return advanceTopologicalDiscovery(nodes, discovery);
            },
            createTopologicalDiscovery(nodes)
        )
        .generations;
}

function collectTopologicalGenerations<TIdentifier extends GraphNodeIdentifier, TData>(
    nodes: ReadonlyMap<TIdentifier, GraphNode<TIdentifier, TData>>
): readonly (readonly TIdentifier[])[] {
    assertAcyclic(nodes);
    return collectTopologicalGenerationsFromAcyclicGraph(nodes);
}

export function createDirectedGraph<TIdentifier extends GraphNodeIdentifier, TData>(): DirectedGraph<
    TIdentifier,
    TData
> {
    const nodes = new Map<TIdentifier, GraphNode<TIdentifier, TData>>();

    return {
        addNode(identifier, data) {
            if (nodes.has(identifier)) {
                throw new Error(`Node with id "${identifier}" already exists`);
            }
            nodes.set(identifier, { identifier, data, adjacentNodeIdentifiers: new Set(), incomingEdges: 0 });
        },
        connect(edge) {
            const fromNode = getNode(nodes, edge.from);
            const toNode = getNode(nodes, edge.to);
            if (fromNode.adjacentNodeIdentifiers.has(toNode.identifier)) {
                throw new Error(`Edge from "${edge.from}" to "${toNode.identifier}" already exists`);
            }
            if (fromNode.identifier === toNode.identifier) {
                nodes.set(fromNode.identifier, {
                    ...fromNode,
                    adjacentNodeIdentifiers: new Set([ ...fromNode.adjacentNodeIdentifiers, toNode.identifier ]),
                    incomingEdges: fromNode.incomingEdges + 1
                });
                return;
            }
            nodes.set(fromNode.identifier, {
                ...fromNode,
                adjacentNodeIdentifiers: new Set([ ...fromNode.adjacentNodeIdentifiers, toNode.identifier ])
            });
            nodes.set(toNode.identifier, { ...toNode, incomingEdges: toNode.incomingEdges + 1 });
        },
        disconnect(edge) {
            const fromNode = getNode(nodes, edge.from);
            const toNode = getNode(nodes, edge.to);
            if (!fromNode.adjacentNodeIdentifiers.has(toNode.identifier)) {
                throw new Error(`Edge from "${edge.from}" to "${toNode.identifier}" does not exist`);
            }
            disconnectExistingEdge(nodes, fromNode, toNode);
        },
        hasNode(identifier) {
            return nodes.has(identifier);
        },
        hasConnection(edge) {
            return getNode(nodes, edge.from).adjacentNodeIdentifiers.has(edge.to);
        },
        visitBreadthFirstSearch(startIdentifier, visitor) {
            visitGraphBreadthFirstSearch(nodes, startIdentifier, visitor);
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
            const reversedGraph = createDirectedGraph<TIdentifier, TData>();
            for (const node of nodes.values()) {
                reversedGraph.addNode(node.identifier, node.data);
            }
            for (const node of nodes.values()) {
                for (const adjacentNodeIdentifier of node.adjacentNodeIdentifiers) {
                    reversedGraph.connect({ from: adjacentNodeIdentifier, to: node.identifier });
                }
            }
            return reversedGraph;
        },
        getAdjacentIdentifiers(identifier) {
            return getNode(nodes, identifier).adjacentNodeIdentifiers;
        },
        traverse(visitor) {
            for (const [ nodeIdentifier, node ] of nodes) {
                if (node.incomingEdges === 0) {
                    visitGraphBreadthFirstSearch(nodes, nodeIdentifier, visitor);
                }
            }
        }
    };
}
