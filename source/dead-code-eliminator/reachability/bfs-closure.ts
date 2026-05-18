export type BfsClosureDependencies = {
    readonly visitedHas: <T>(visited: ReadonlySet<T>, value: T) => boolean;
};

function assertTraversalIteration(remainingIterations: number): void {
    if (remainingIterations === 0) {
        throw new Error('Reachability traversal exceeded the maximum iteration budget');
    }
}

function createTraversalBudget(maximumIterations: number): readonly number[] {
    return Array.from({ length: maximumIterations + 1 }, (_value, index) => {
        return maximumIterations - index;
    });
}

function getMaximumTraversalIterations(
    initialVisitedSize: number,
    seedCount: number,
    maximumNodeCount: number
): number {
    return initialVisitedSize + seedCount + maximumNodeCount * maximumNodeCount;
}

function createTraversalState<T>(
    initialVisited: ReadonlySet<T>,
    seedList: readonly T[]
): {
    readonly visited: Set<T>;
    readonly queue: T[];
} {
    const visited = new Set<T>([...initialVisited, ...seedList]);
    return { visited, queue: Array.from(visited) };
}

function enqueueUnvisitedNeighbors<T>(
    current: T,
    expand: (current: T) => Iterable<T>,
    traversalState: {
        readonly visited: Set<T>;
        readonly queue: T[];
    },
    visitedHas: BfsClosureDependencies['visitedHas']
): void {
    for (const neighbor of expand(current)) {
        if (!visitedHas(traversalState.visited, neighbor)) {
            traversalState.visited.add(neighbor);
            traversalState.queue.push(neighbor);
        }
    }
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
    const maximumIterations = getMaximumTraversalIterations(
        initialVisited.size,
        seedList.length,
        options.maximumNodeCount
    );
    const traversalState = createTraversalState(initialVisited, seedList);

    for (const remainingIterations of createTraversalBudget(maximumIterations)) {
        const current = traversalState.queue.shift();
        if (current === undefined) {
            break;
        }
        assertTraversalIteration(remainingIterations);
        enqueueUnvisitedNeighbors(current, expand, traversalState, options.dependencies.visitedHas);
    }

    return traversalState.visited;
}
