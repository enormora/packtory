type GraphNodeId = string | number;

interface GraphNode<TId extends GraphNodeId, TData> {
    id: TId,
    data: TData;
    adjacentNodeIds: Set<TId>;
}

interface GraphEdge<TId extends GraphNodeId> {
    from: TId;
    to: TId;
}

type Visitor<TId extends GraphNodeId, TData> = (node: GraphNode<TId, TData>) => void;

export interface DirectedGraph<TId extends GraphNodeId, TData> {
    addNode(id: TId, data: TData): void
    connect(edge: GraphEdge<TId>): void
    disconnect(edge: GraphEdge<TId>): void
    hasNode(id: TId): boolean
    hasConnection(edge: GraphEdge<TId>): boolean
    visitBreadthFirstSearch(startId: TId, visitor: Visitor<TId, TData>): void;
}

function addAdjacentNodeId<TId extends GraphNodeId, TData>(node: GraphNode<TId, TData>, idToAdd: TId): GraphNode<TId, TData> {
    return {
        id: node.id,
        data: node.data,
        adjacentNodeIds: new Set([ ...node.adjacentNodeIds, idToAdd ])
    };
}

function removeAdjacentNodeId<TId extends GraphNodeId, TData>(node: GraphNode<TId, TData>, idToRemove: TId): GraphNode<TId, TData> {
    const adjacentNodeIds = new Set(node.adjacentNodeIds);

    adjacentNodeIds.delete(idToRemove);

    return {
        id: node.id,
        data: node.data,
        adjacentNodeIds
    };
}

function getNonVisitedAdjacentIds<TId extends GraphNodeId, TData>(node: GraphNode<TId, TData>, visited: Set<TId>): TId[] {
    return Array.from(node.adjacentNodeIds).filter((id) => {
        return !visited.has(id)
    });
}


export function createDirectedGraph<TId extends GraphNodeId, TData>(): DirectedGraph<TId, TData> {
    const nodes = new Map<TId, GraphNode<TId, TData>>();

    function getNode(id: TId): GraphNode<TId, TData> {
        const node = nodes.get(id);

        if (!node) {
            throw new Error(`Node with id "${id}" does not exist`);
        }

        return node;
    }

    return {
        addNode(id, data) {
            if (nodes.has(id)) {
                throw new Error(`Node with id "${id}" already exists`);
            }
            nodes.set(id, {id, data, adjacentNodeIds: new Set()});
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

            nodes.set(edge.from, addAdjacentNodeId(fromNode, toNode.id))
        },

        disconnect(edge) {
            const fromNode = getNode(edge.from);
            const toNode = getNode(edge.to);

            if (!fromNode.adjacentNodeIds.has(toNode.id)) {
                throw new Error(`Edge from "${edge.from}" to "${toNode.id}" does not exist`);
            }

            nodes.set(edge.from, removeAdjacentNodeId(fromNode, toNode.id))
        },

        visitBreadthFirstSearch(startId, visitor) {
            const startNode = getNode(startId);
            const queue: GraphNode<TId, TData>[] = [ startNode ];
            const visited = new Set<TId>();

            for (let head = queue.shift(); typeof head !== 'undefined'; head = queue.shift()) {
                visited.add(head.id);
                visitor(head);
                const nonVisitedAdjacentIds = getNonVisitedAdjacentIds(head, visited);
                for (const id of nonVisitedAdjacentIds) {
                    const adjacentNode = getNode(id);
                    queue.push(adjacentNode)
                }
            }
        }
    };
}
