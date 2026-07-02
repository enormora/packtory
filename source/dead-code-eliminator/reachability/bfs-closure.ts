export type BfsClosureDependencies = {
    readonly visitedHas: <T>(visited: ReadonlySet<T>, value: T) => boolean;
};

type BfsClosureOptions = {
    readonly maximumNodeCount: number;
    readonly dependencies: BfsClosureDependencies;
};

type TraversalState<T> = {
    readonly current: T | undefined;
    readonly pending: readonly T[];
    readonly visited: ReadonlySet<T>;
};
type ActiveTraversalState<T> = TraversalState<T> & {
    readonly current: T;
};

function initialTraversalState<T>(initialVisited: ReadonlySet<T>, seedList: readonly T[]): TraversalState<T> {
    const [ current, ...pending ] = seedList;
    return { current, pending, visited: new Set([ ...initialVisited, ...seedList ]) };
}

function enqueueNeighbor<T>(
    state: TraversalState<T>,
    neighbor: T,
    visitedHas: BfsClosureDependencies['visitedHas']
): TraversalState<T> {
    if (visitedHas(state.visited, neighbor)) {
        return state;
    }
    return {
        current: state.current,
        pending: [ ...state.pending, neighbor ],
        visited: new Set([ ...state.visited, neighbor ])
    };
}

function visitCurrent<T>(
    state: ActiveTraversalState<T>,
    expand: (current: T) => Iterable<T>,
    visitedHas: BfsClosureDependencies['visitedHas']
): TraversalState<T> {
    let nextState: TraversalState<T> = state;
    for (const neighbor of expand(state.current)) {
        nextState = enqueueNeighbor(nextState, neighbor, visitedHas);
    }
    const [ current, ...pending ] = nextState.pending;
    return { current, pending, visited: nextState.visited };
}

function attemptIndexes(maximumAttempts: number): readonly number[] {
    return Array.from({ length: maximumAttempts }, function (_value, index) {
        return index;
    });
}

function traverseUntilExhausted<T>(
    state: ActiveTraversalState<T>,
    expand: (current: T) => Iterable<T>,
    maximumAttempts: number,
    options: BfsClosureOptions
): Set<T> {
    let traversalState: TraversalState<T> = state;
    let current: T = state.current;
    let attemptsUsed = 0;

    for (const attempt of attemptIndexes(maximumAttempts)) {
        attemptsUsed = attempt + 1;
        traversalState = visitCurrent(
            { current, pending: traversalState.pending, visited: traversalState.visited },
            expand,
            options.dependencies.visitedHas
        );
        if (traversalState.current === undefined) {
            return new Set(traversalState.visited);
        }
        current = traversalState.current;
    }

    throw new Error(`Reachability traversal exceeded ${attemptsUsed} attempts`);
}

export function bfsClosure<T>(
    seeds: Iterable<T>,
    expand: (current: T) => Iterable<T>,
    initialVisited: ReadonlySet<T>,
    options: BfsClosureOptions
): Set<T> {
    const seedList = Array.from(seeds);
    const maximumAttempts = initialVisited.size + seedList.length + options.maximumNodeCount * options.maximumNodeCount;
    const state = initialTraversalState(initialVisited, seedList);

    if (state.current === undefined) {
        return new Set(state.visited);
    }
    return traverseUntilExhausted({ ...state, current: state.current }, expand, maximumAttempts, options);
}
