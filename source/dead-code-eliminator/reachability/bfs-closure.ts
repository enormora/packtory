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
    state: TraversalState<T>,
    expand: (current: T) => Iterable<T>,
    visitedHas: BfsClosureDependencies['visitedHas']
): TraversalState<T> {
    if (state.current === undefined) {
        return state;
    }
    let nextState = state;
    for (const neighbor of expand(state.current)) {
        nextState = enqueueNeighbor(nextState, neighbor, visitedHas);
    }
    const [ current, ...pending ] = nextState.pending;
    return { current, pending, visited: nextState.visited };
}

export function bfsClosure<T>(
    seeds: Iterable<T>,
    expand: (current: T) => Iterable<T>,
    initialVisited: ReadonlySet<T>,
    options: BfsClosureOptions
): Set<T> {
    const seedList = Array.from(seeds);
    const maximumAttempts = initialVisited.size + seedList.length + options.maximumNodeCount * options.maximumNodeCount;
    let state = initialTraversalState(initialVisited, seedList);

    if (state.current === undefined) {
        return new Set(state.visited);
    }

    for (let attempts = 0; attempts < maximumAttempts; attempts += 1) {
        state = visitCurrent(state, expand, options.dependencies.visitedHas);
        if (state.current === undefined) {
            return new Set(state.visited);
        }
    }

    throw new Error('Reachability traversal exceeded the maximum iteration budget');
}
