import { createWorklist, type Worklist } from '../../common/worklist.ts';

export type BfsClosureDependencies<T> = {
    readonly visitedHas: (visited: ReadonlySet<T>, value: T) => boolean;
    readonly neighborAdded: ((current: T, neighbor: T) => void) | undefined;
};

type BfsClosureOptions<T> = {
    readonly maximumNodeCount: number;
    readonly dependencies: BfsClosureDependencies<T>;
};

type TraversalState<T> = {
    readonly pending: Worklist<T>;
    readonly visited: ReadonlySet<T>;
    readonly scheduleNeighbor: (neighbor: T) => void;
};

function enqueueNeighbor<T>(
    current: T,
    neighbor: T,
    state: TraversalState<T>,
    dependencies: BfsClosureDependencies<T>
): void {
    if (dependencies.visitedHas(state.visited, neighbor)) {
        return;
    }
    if (dependencies.neighborAdded !== undefined) {
        dependencies.neighborAdded(current, neighbor);
    }
    state.scheduleNeighbor(neighbor);
}

function traverseUntilExhausted<T>(
    state: TraversalState<T>,
    expand: (current: T) => Iterable<T>,
    maximumAttempts: number,
    dependencies: BfsClosureDependencies<T>
): void {
    let attemptsUsed = 0;
    for (let current = state.pending.takeNext(); current !== undefined; current = state.pending.takeNext()) {
        if (attemptsUsed >= maximumAttempts) {
            throw new Error(`Reachability traversal exceeded ${attemptsUsed} attempts`);
        }
        attemptsUsed += 1;
        for (const neighbor of expand(current)) {
            enqueueNeighbor(current, neighbor, state, dependencies);
        }
    }
}

export function bfsClosure<T>(
    seeds: Iterable<T>,
    expand: (current: T) => Iterable<T>,
    initialVisited: ReadonlySet<T>,
    options: BfsClosureOptions<T>
): Set<T> {
    const seedList = Array.from(seeds);
    const maximumAttempts = initialVisited.size + seedList.length + options.maximumNodeCount * options.maximumNodeCount;
    const pending = createWorklist(seedList);
    const visited = new Set(initialVisited);
    for (const seed of seedList) {
        visited.add(seed);
    }
    traverseUntilExhausted(
        {
            pending,
            visited,
            scheduleNeighbor(neighbor) {
                visited.add(neighbor);
                pending.schedule(neighbor);
            }
        },
        expand,
        maximumAttempts,
        options.dependencies
    );
    return visited;
}
