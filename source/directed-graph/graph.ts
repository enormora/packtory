type GraphNodeId = number | string;

type GraphNode<TId extends GraphNodeId, TData> = {
    readonly id: TId;
    readonly data: TData;
    readonly adjacentNodeIds: Set<TId>;
    readonly incomingEdges: number;
};

export type GraphEdge<TId extends GraphNodeId> = {
    readonly from: TId;
    readonly to: TId;
};

type Visitor<TId extends GraphNodeId, TData> = (node: Readonly<GraphNode<TId, TData>>) => void;

export type DirectedGraph<TId extends GraphNodeId, TData> = {
    addNode(id: TId, data: TData): void;
    connect(edge: Readonly<GraphEdge<TId>>): void;
    disconnect(edge: Readonly<GraphEdge<TId>>): void;
    hasNode(id: TId): boolean;
    hasConnection(edge: Readonly<GraphEdge<TId>>): boolean;
    visitBreadthFirstSearch(startId: TId, visitor: Visitor<TId, TData>): void;
    detectCycles(): readonly (readonly TId[])[];
    isCyclic(): boolean;
    getTopologicalGenerations(): readonly (readonly TId[])[];
};

function addAdjacentNodeId<TId extends GraphNodeId, TData>(
    node: Readonly<GraphNode<TId, TData>>,
    idToAdd: TId
): Readonly<GraphNode<TId, TData>> {
    return {
        id: node.id,
        data: node.data,
        incomingEdges: node.incomingEdges,
        adjacentNodeIds: new Set([...node.adjacentNodeIds, idToAdd])
    };
}

function removeAdjacentNodeId<TId extends GraphNodeId, TData>(
    node: Readonly<GraphNode<TId, TData>>,
    idToRemove: TId
): Readonly<GraphNode<TId, TData>> {
    const adjacentNodeIds = new Set(node.adjacentNodeIds);

    adjacentNodeIds.delete(idToRemove);

    return {
        id: node.id,
        data: node.data,
        incomingEdges: node.incomingEdges,
        adjacentNodeIds
    };
}

function increaseIncomingEdges<TId extends GraphNodeId, TData>(
    node: Readonly<GraphNode<TId, TData>>
): Readonly<GraphNode<TId, TData>> {
    return {
        id: node.id,
        data: node.data,
        adjacentNodeIds: node.adjacentNodeIds,
        incomingEdges: node.incomingEdges + 1
    };
}

function decreaseIncomingEdges<TId extends GraphNodeId, TData>(
    node: Readonly<GraphNode<TId, TData>>
): Readonly<GraphNode<TId, TData>> {
    return {
        id: node.id,
        data: node.data,
        adjacentNodeIds: node.adjacentNodeIds,
        incomingEdges: node.incomingEdges - 1
    };
}

function getNonVisitedAdjacentIds<TId extends GraphNodeId, TData>(
    node: Readonly<GraphNode<TId, TData>>,
    visited: ReadonlySet<TId>
): readonly TId[] {
    return Array.from(node.adjacentNodeIds).filter((id) => {
        return !visited.has(id);
    });
}

export function createDirectedGraph<TId extends GraphNodeId, TData>(): DirectedGraph<TId, TData> {
    const nodes = new Map<TId, GraphNode<TId, TData>>();

    function getNode(id: TId): Readonly<GraphNode<TId, TData>> {
        const node = nodes.get(id);

        if (node === undefined) {
            throw new Error(`Node with id "${id}" does not exist`);
        }

        return node;
    }

    function getIncomingEdgesPerNode(): Map<TId, number> {
        const incomingEdgesPerNode = new Map<TId, number>();

        for (const node of nodes.values()) {
            incomingEdgesPerNode.set(node.id, node.incomingEdges);
        }

        return incomingEdgesPerNode;
    }

    function decreaseIncomingEdgesPerNodeForAdjacentNodes(
        incomingEdgesPerNode: Map<TId, number>,
        ids: TId[]
    ): Map<TId, number> {
        const newIncomingEdgesPerNode = new Map(incomingEdgesPerNode);

        for (const id of ids) {
            const node = getNode(id);

            for (const adjacentNodeId of node.adjacentNodeIds) {
                const degree = newIncomingEdgesPerNode.get(adjacentNodeId) ?? 0;
                newIncomingEdgesPerNode.set(adjacentNodeId, degree - 1);
            }
        }

        return newIncomingEdgesPerNode;
    }

    function detectCyclesForNode(
        baseNode: GraphNode<TId, TData>,
        visitedIds: readonly TId[]
    ): readonly (readonly TId[])[] {
        const newVisitedIds = [...visitedIds, baseNode.id];

        if (visitedIds.includes(baseNode.id)) {
            return [newVisitedIds];
        }

        const cycles: (readonly TId[])[] = [];

        for (const id of baseNode.adjacentNodeIds) {
            const cyclesInAdjacentNode = detectCyclesForNode(getNode(id), newVisitedIds);
            cycles.push(...cyclesInAdjacentNode);
        }

        return cycles;
    }

    function detectCycles(): readonly (readonly TId[])[] {
        const cycles: (readonly TId[])[] = [];
        const idsWithinCycles = new Set<TId>();

        for (const baseNode of nodes.values()) {
            if (!idsWithinCycles.has(baseNode.id)) {
                const cyclesForNode = detectCyclesForNode(baseNode, []);

                if (cyclesForNode.length > 0) {
                    cycles.push(...cyclesForNode);
                    for (const id of cyclesForNode.flat()) {
                        idsWithinCycles.add(id);
                    }
                }
            }
        }

        return cycles;
    }

    function isCyclic(): boolean {
        const cycles = detectCycles();
        return cycles.length > 0;
    }

    function recursivelyGetTopologicalGenerations(
        alreadyDiscovered: Set<TId>,
        incomingEdgesPerNode: Map<TId, number>
    ): readonly (readonly TId[])[] {
        const currentGeneration: TId[] = [];

        for (const node of nodes.values()) {
            if (!alreadyDiscovered.has(node.id) && incomingEdgesPerNode.get(node.id) === 0) {
                currentGeneration.push(node.id);
            }
        }

        if (currentGeneration.length > 0) {
            const newIncomingEdgesPerNode = decreaseIncomingEdgesPerNodeForAdjacentNodes(
                incomingEdgesPerNode,
                currentGeneration
            );
            const currentlyDiscovered = new Set([...alreadyDiscovered, ...currentGeneration]);
            const generations = recursivelyGetTopologicalGenerations(currentlyDiscovered, newIncomingEdgesPerNode);
            return [currentGeneration, ...generations];
        }

        return [];
    }

    return {
        addNode(id, data) {
            if (nodes.has(id)) {
                throw new Error(`Node with id "${id}" already exists`);
            }
            nodes.set(id, { id, data, adjacentNodeIds: new Set(), incomingEdges: 0 });
        },

        hasNode(id) {
            return nodes.has(id);
        },

        hasConnection(edge) {
            const fromNode = getNode(edge.from);
            return fromNode.adjacentNodeIds.has(edge.to);
        },

        connect(edge) {
            const fromNode = getNode(edge.from);
            const toNode = getNode(edge.to);

            if (fromNode.adjacentNodeIds.has(toNode.id)) {
                throw new Error(`Edge from "${edge.from}" to "${toNode.id}" already exists`);
            }

            nodes.set(edge.from, addAdjacentNodeId(fromNode, toNode.id));
            nodes.set(edge.to, increaseIncomingEdges(getNode(edge.to)));
        },

        disconnect(edge) {
            const fromNode = getNode(edge.from);
            const toNode = getNode(edge.to);

            if (!fromNode.adjacentNodeIds.has(toNode.id)) {
                throw new Error(`Edge from "${edge.from}" to "${toNode.id}" does not exist`);
            }

            nodes.set(edge.from, removeAdjacentNodeId(fromNode, toNode.id));
            nodes.set(edge.to, decreaseIncomingEdges(toNode));
        },

        visitBreadthFirstSearch(startId, visitor) {
            const startNode = getNode(startId);
            const queue: GraphNode<TId, TData>[] = [startNode];
            const visited = new Set<TId>();

            for (let head = queue.shift(); head !== undefined; head = queue.shift()) {
                visited.add(head.id);
                visitor(head);
                const nonVisitedAdjacentIds = getNonVisitedAdjacentIds(head, visited);
                for (const id of nonVisitedAdjacentIds) {
                    const adjacentNode = getNode(id);
                    queue.push(adjacentNode);
                }
            }
        },

        detectCycles,

        isCyclic,

        getTopologicalGenerations() {
            if (isCyclic()) {
                throw new Error('Failed to determine topological generations, current graph is cyclic');
            }

            const incomingEdgesPerNode = getIncomingEdgesPerNode();
            return recursivelyGetTopologicalGenerations(new Set(), incomingEdgesPerNode);
        }
    };
}
