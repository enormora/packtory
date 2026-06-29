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

function hasCurrent<T>(state: TraversalState<T>): state is ActiveTraversalState<T> {
    return state.current !== undefined;
}

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

function finishClosureTraversal<T>(
    initialState: ActiveTraversalState<T>,
    maximumAttempts: number,
    expand: (current: T) => Iterable<T>,
    visitedHas: BfsClosureDependencies['visitedHas']
): Set<T> {
    let activeState = initialState;
    const visitAttempts = Array.from({ length: maximumAttempts }, function () {
        return function (): Set<T> | undefined {
            const nextState = visitCurrent(activeState, expand, visitedHas);
            if (!hasCurrent(nextState)) {
                return new Set(nextState.visited);
            }
            activeState = nextState;
            return undefined;
        };
    });

    for (const visitAttempt of visitAttempts) {
        const result = visitAttempt();
        if (result !== undefined) {
            return result;
        }
    }

    throw new Error('Reachability traversal exceeded the maximum iteration budget');
}

export function bfsClosure<T>(
    seeds: Iterable<T>,
    expand: (current: T) => Iterable<T>,
    initialVisited: ReadonlySet<T>,
    options: BfsClosureOptions
): Set<T> {
    const seedList = Array.from(seeds);
    const maximumAttempts = initialVisited.size + seedList.length + options.maximumNodeCount * options.maximumNodeCount;
    const initialState = initialTraversalState(initialVisited, seedList);

    if (!hasCurrent(initialState)) {
        return new Set(initialState.visited);
    }

    return finishClosureTraversal(initialState, maximumAttempts, expand, options.dependencies.visitedHas);
}
