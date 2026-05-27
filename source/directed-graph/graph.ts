/* eslint-disable max-statements, no-continue -- graph traversal utilities are intentionally imperative */
import { createWorklist, type Worklist } from '../common/worklist.ts';

type GraphNodeId = number | string;

type GraphNode<TId extends GraphNodeId, TData> = {
    id: TId;
    data: TData;
    adjacentNodeIds: Set<TId>;
    incomingEdges: number;
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

    function getNode(id: TId): GraphNode<TId, TData> {
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

    function stepBreadthFirstSearch(
        head: GraphNode<TId, TData>,
        pendingNodes: Worklist<GraphNode<TId, TData>>,
        visited: Set<TId>,
        visitor: Visitor<TId, TData>
    ): GraphNode<TId, TData> | undefined {
        if (resolvedDependencies.visitedHas(visited, head.id)) {
            return pendingNodes.takeNext();
        }

        visited.add(head.id);
        visitor(head);
        for (const id of head.adjacentNodeIds) {
            const adjacentNode = getNode(id);
            pendingNodes.schedule(adjacentNode);
        }

        return pendingNodes.takeNext();
    }

    function visitBreadthFirstSearch(startId: TId, visitor: Visitor<TId, TData>): void {
        const startNode = getNode(startId);
        const pendingNodes = createWorklist<GraphNode<TId, TData>>([]);
        const visited = new Set<TId>();
        const traversalBudget = Array.from({
            length:
                nodes.size +
                Array.from(nodes.values()).reduce((edgeCount, node) => {
                    return edgeCount + node.adjacentNodeIds.size;
                }, 0) +
                1
        });
        let head = startNode;

        const completed = traversalBudget.some(() => {
            const next = stepBreadthFirstSearch(head, pendingNodes, visited, visitor);
            if (next === undefined) {
                return true;
            }

            head = next;
            return false;
        });

        if (completed) {
            return;
        }

        throw new Error('Breadth-first traversal exceeded the maximum iteration budget');
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

        fromNode.adjacentNodeIds.add(toNode.id);
        toNode.incomingEdges += 1;
    }

    function disconnect(edge: GraphEdge<TId>): void {
        const fromNode = getNode(edge.from);
        const toNode = getNode(edge.to);

        if (!fromNode.adjacentNodeIds.has(toNode.id)) {
            throw new Error(`Edge from "${edge.from}" to "${toNode.id}" does not exist`);
        }

        fromNode.adjacentNodeIds.delete(toNode.id);
        toNode.incomingEdges -= 1;
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
        let exhaustedAttempts = 0;
        const generationAttempts = Array.from({ length: nodes.size + 1 }, (_unused, index) => {
            return index + 1;
        });

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
