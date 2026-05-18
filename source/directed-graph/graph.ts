/* eslint-disable max-statements, no-continue -- graph traversal utilities are intentionally imperative */
type GraphNodeId = number | string;

type GraphNode<TId extends GraphNodeId, TData> = {
    readonly id: TId;
    readonly data: TData;
    readonly adjacentNodeIds: Set<TId>;
    readonly incomingEdges: number;
};

type GraphEdge<TId extends GraphNodeId> = {
    readonly from: TId;
    readonly to: TId;
};

type Visitor<TId extends GraphNodeId, TData> = (node: Readonly<GraphNode<TId, TData>>) => void;

type GraphDependencies<TId extends GraphNodeId> = {
    readonly cyclePathIncludes: (visitedIds: readonly TId[], id: TId) => boolean;
    readonly mergeDiscovered: (alreadyDiscovered: ReadonlySet<TId>, currentGeneration: readonly TId[]) => Set<TId>;
    readonly visitedHas: (visited: ReadonlySet<TId>, id: TId) => boolean;
};

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

const breadthFirstTraversalBudgetExceededErrorMessage = 'Breadth-first traversal exceeded the maximum iteration budget';

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

function withAdjustedIncomingEdges<TId extends GraphNodeId, TData>(
    node: Readonly<GraphNode<TId, TData>>,
    delta: number
): Readonly<GraphNode<TId, TData>> {
    return {
        id: node.id,
        data: node.data,
        adjacentNodeIds: node.adjacentNodeIds,
        incomingEdges: node.incomingEdges + delta
    };
}

function increaseIncomingEdges<TId extends GraphNodeId, TData>(
    node: Readonly<GraphNode<TId, TData>>
): Readonly<GraphNode<TId, TData>> {
    return withAdjustedIncomingEdges(node, 1);
}

function decreaseIncomingEdges<TId extends GraphNodeId, TData>(
    node: Readonly<GraphNode<TId, TData>>
): Readonly<GraphNode<TId, TData>> {
    return withAdjustedIncomingEdges(node, -1);
}

function getNonVisitedAdjacentIds<TId extends GraphNodeId, TData>(
    node: Readonly<GraphNode<TId, TData>>
): readonly TId[] {
    return Array.from(node.adjacentNodeIds);
}

export function createDirectedGraph<TId extends GraphNodeId, TData>(
    dependencies: Partial<GraphDependencies<TId>> = {}
): DirectedGraph<TId, TData> {
    const resolvedDependencies: GraphDependencies<TId> = {
        cyclePathIncludes(visitedIds, id) {
            return visitedIds.includes(id);
        },
        mergeDiscovered(alreadyDiscovered, currentGeneration) {
            return new Set([...alreadyDiscovered, ...currentGeneration]);
        },
        visitedHas(visited, id) {
            return visited.has(id);
        },
        ...dependencies
    };
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
                const degree = Number(newIncomingEdgesPerNode.get(adjacentNodeId));
                newIncomingEdgesPerNode.set(adjacentNodeId, degree - 1);
            }
        }

        return newIncomingEdgesPerNode;
    }

    function getTraversalBudget(): number {
        let edgeCount = 0;

        for (const node of nodes.values()) {
            edgeCount += node.adjacentNodeIds.size;
        }

        return nodes.size + edgeCount + 1;
    }

    function detectCyclesForNode(
        baseNode: GraphNode<TId, TData>,
        visitedIds: readonly TId[]
    ): readonly (readonly TId[])[] {
        if (visitedIds.length === nodes.size + 1) {
            throw new Error('Cycle detection exceeded the maximum traversal depth');
        }

        const newVisitedIds = [...visitedIds, baseNode.id];
        const cycles: (readonly TId[])[] = [];

        for (const id of baseNode.adjacentNodeIds) {
            if (resolvedDependencies.cyclePathIncludes(newVisitedIds, id)) {
                cycles.push([...newVisitedIds, id]);
                continue;
            }

            const cyclesInAdjacentNode = detectCyclesForNode(getNode(id), newVisitedIds);
            cycles.push(...cyclesInAdjacentNode);
        }

        return cycles;
    }

    function collectCurrentGeneration(
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

    function detectCycles(): readonly (readonly TId[])[] {
        const cycles: (readonly TId[])[] = [];
        const idsWithinCycles = new Set<TId>();

        for (const baseNode of nodes.values()) {
            if (!resolvedDependencies.visitedHas(idsWithinCycles, baseNode.id)) {
                const cyclesForNode = detectCyclesForNode(baseNode, []);
                cycles.push(...cyclesForNode);
                for (const id of cyclesForNode.flat()) {
                    idsWithinCycles.add(id);
                }
            }
        }

        return cycles;
    }

    function isCyclic(): boolean {
        const cycles = detectCycles();
        return cycles.length > 0;
    }

    function visitBreadthFirstSearch(startId: TId, visitor: Visitor<TId, TData>): void {
        const startNode = getNode(startId);
        const queue: GraphNode<TId, TData>[] = [startNode];
        const visited = new Set<TId>();
        const traversalBudget = getTraversalBudget();

        for (let nextNodeIndex = 0; nextNodeIndex < traversalBudget; nextNodeIndex += 1) {
            const head = queue[nextNodeIndex];
            if (head === undefined) {
                return;
            }

            if (resolvedDependencies.visitedHas(visited, head.id)) {
                continue;
            }

            visited.add(head.id);
            visitor(head);
            const nonVisitedAdjacentIds = getNonVisitedAdjacentIds(head);
            for (const id of nonVisitedAdjacentIds) {
                const adjacentNode = getNode(id);
                queue.push(adjacentNode);
            }
        }

        throw new Error(breadthFirstTraversalBudgetExceededErrorMessage);
    }

    function hasNode(id: TId): boolean {
        return nodes.has(id);
    }

    function getAdjacentIds(id: TId): ReadonlySet<TId> {
        const node = getNode(id);
        return node.adjacentNodeIds;
    }

    function addNode(id: TId, data: TData): void {
        if (nodes.has(id)) {
            throw new Error(`Node with id "${id}" already exists`);
        }
        nodes.set(id, { id, data, adjacentNodeIds: new Set(), incomingEdges: 0 });
    }
    function hasConnection(edge: GraphEdge<TId>): boolean {
        const fromNode = getNode(edge.from);
        return fromNode.adjacentNodeIds.has(edge.to);
    }

    function connect(edge: GraphEdge<TId>): void {
        const fromNode = getNode(edge.from);
        const toNode = getNode(edge.to);

        if (fromNode.adjacentNodeIds.has(toNode.id)) {
            throw new Error(`Edge from "${edge.from}" to "${toNode.id}" already exists`);
        }

        nodes.set(edge.from, addAdjacentNodeId(fromNode, toNode.id));
        nodes.set(edge.to, increaseIncomingEdges(getNode(edge.to)));
    }

    function disconnect(edge: GraphEdge<TId>): void {
        const fromNode = getNode(edge.from);
        const toNode = getNode(edge.to);

        if (!fromNode.adjacentNodeIds.has(toNode.id)) {
            throw new Error(`Edge from "${edge.from}" to "${toNode.id}" does not exist`);
        }

        nodes.set(edge.from, removeAdjacentNodeId(fromNode, toNode.id));
        nodes.set(edge.to, decreaseIncomingEdges(toNode));
    }

    function traverse(visitor: Visitor<TId, TData>): void {
        for (const [nodeId, node] of nodes) {
            if (node.incomingEdges === 0) {
                visitBreadthFirstSearch(nodeId, visitor);
            }
        }
    }

    function getTopologicalGenerations(): readonly (readonly TId[])[] {
        if (isCyclic()) {
            throw new Error('Failed to determine topological generations, current graph is cyclic');
        }

        const generations: TId[][] = [];
        let alreadyDiscovered = new Set<TId>();
        let incomingEdgesPerNode = getIncomingEdgesPerNode();
        const generationAttempts = Array.from({ length: nodes.size + 1 }, (_unusedEntry, index) => {
            return index + 1;
        });
        let exhaustedAttempts = 0;

        for (const attempt of generationAttempts) {
            exhaustedAttempts = attempt;
            const currentGeneration = collectCurrentGeneration(alreadyDiscovered, incomingEdgesPerNode);

            if (currentGeneration.length === 0) {
                return generations;
            }

            const currentlyDiscovered = resolvedDependencies.mergeDiscovered(alreadyDiscovered, currentGeneration);
            generations.push(Array.from(currentGeneration));
            alreadyDiscovered = currentlyDiscovered;
            incomingEdgesPerNode = decreaseIncomingEdgesPerNodeForAdjacentNodes(
                incomingEdgesPerNode,
                Array.from(currentGeneration)
            );
        }

        throw new Error(`Topological generation discovery did not make progress after ${exhaustedAttempts} attempts`);
    }

    function reverse(): DirectedGraph<TId, TData> {
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
    }

    return {
        addNode,
        getAdjacentIds,
        hasNode,
        hasConnection,
        connect,
        disconnect,
        visitBreadthFirstSearch,
        traverse,
        detectCycles,
        isCyclic,
        getTopologicalGenerations,
        reverse
    };
}
