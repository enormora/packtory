import { createWorklist, type Worklist } from '../../common/worklist.ts';

export type BfsClosureDependencies = {
    readonly visitedHas: <T>(visited: ReadonlySet<T>, value: T) => boolean;
};

function createTraversalState<T>(
    initialVisited: ReadonlySet<T>,
    seedList: readonly T[]
): {
    readonly visited: Set<T>;
    readonly pending: Worklist<T>;
} {
    const visited = new Set<T>([...initialVisited, ...seedList]);
    return { visited, pending: createWorklist(visited) };
}

function enqueueUnvisitedNeighbors<T>(
    current: T,
    expand: (current: T) => Iterable<T>,
    traversalState: {
        readonly visited: Set<T>;
        readonly pending: Worklist<T>;
    },
    visitedHas: BfsClosureDependencies['visitedHas']
): void {
    for (const neighbor of expand(current)) {
        if (!visitedHas(traversalState.visited, neighbor)) {
            traversalState.visited.add(neighbor);
            traversalState.pending.schedule(neighbor);
        }
    }
}

function traverseWithinBudget<T>(args: {
    readonly current: T;
    readonly expand: (current: T) => Iterable<T>;
    readonly traversalState: {
        readonly visited: Set<T>;
        readonly pending: Worklist<T>;
    };
    readonly visitedHas: BfsClosureDependencies['visitedHas'];
    readonly traversalBudget: readonly unknown[];
}): boolean {
    let currentNode = args.current;

    return args.traversalBudget.some(() => {
        enqueueUnvisitedNeighbors(currentNode, args.expand, args.traversalState, args.visitedHas);
        const next = args.traversalState.pending.takeNext();
        if (next === undefined) {
            return true;
        }

        currentNode = next;
        return false;
    });
}

export function bfsClosure<T>(
    seeds: Iterable<T>,
    expand: (current: T) => Iterable<T>,
    initialVisited: ReadonlySet<T>,
    options: {
        readonly maximumNodeCount: number;
        readonly dependencies: BfsClosureDependencies;
    }
): Set<T> {
    const seedList = Array.from(seeds);
    const traversalBudget = Array.from({
        length: initialVisited.size + seedList.length + options.maximumNodeCount * options.maximumNodeCount
    });
    const traversalState = createTraversalState(initialVisited, seedList);
    const current = traversalState.pending.takeNext();

    if (current === undefined) {
        return traversalState.visited;
    }

    if (
        traverseWithinBudget({
            current,
            expand,
            traversalState,
            visitedHas: options.dependencies.visitedHas,
            traversalBudget
        })
    ) {
        return traversalState.visited;
    }

    throw new Error('Reachability traversal exceeded the maximum iteration budget');
}
