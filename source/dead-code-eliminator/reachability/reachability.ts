import { SyntaxKind, type Identifier, type Node as TsMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { BindingDescriptor } from './binding-extractor.ts';
import { collectImpureStatements } from './impure-statements.ts';

export type FileBindings = {
    readonly sourceFilePath: string;
    readonly sourceFile: Readonly<SourceFile>;
    readonly bindings: readonly BindingDescriptor[];
};

export type ReachabilityInput = {
    readonly files: readonly FileBindings[];
    readonly entryPointFilePaths: ReadonlySet<string>;
};

export type ReachabilityIndex = {
    readonly localReachable: ReadonlySet<string>;
    readonly bindingIdsByFile: ReadonlyMap<string, ReadonlySet<string>>;
    readonly expandWith: (externalSeeds: ReadonlySet<string> | undefined) => ReadonlySet<string>;
};

type DeclarationNodeIndex = ReadonlyMap<TsMorphNode, string>;
type SymbolReference = NonNullable<ReturnType<Identifier['getSymbol']>>;

export function bindingId(filePath: string, name: string): string {
    return `${filePath}::${name}`;
}

function buildDeclarationNodeIndex(files: readonly FileBindings[]): Map<TsMorphNode, string> {
    const index = new Map<TsMorphNode, string>();
    for (const file of files) {
        for (const binding of file.bindings) {
            index.set(binding.declarationNode, bindingId(file.sourceFilePath, binding.name));
        }
    }
    return index;
}

function buildBindingsByFile(files: readonly FileBindings[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const file of files) {
        const ids = new Set<string>();
        for (const binding of file.bindings) {
            ids.add(bindingId(file.sourceFilePath, binding.name));
        }
        map.set(file.sourceFilePath, ids);
    }
    return map;
}

function buildNodeById(files: readonly FileBindings[]): Map<string, TsMorphNode> {
    const map = new Map<string, TsMorphNode>();
    for (const file of files) {
        for (const binding of file.bindings) {
            map.set(bindingId(file.sourceFilePath, binding.name), binding.declarationNode);
        }
    }
    return map;
}

function addDeclarationTargets(
    declarations: readonly TsMorphNode[],
    declarationIndex: DeclarationNodeIndex,
    targets: Set<string>
): void {
    for (const declaration of declarations) {
        const candidate = declarationIndex.get(declaration);
        if (candidate !== undefined) {
            targets.add(candidate);
        }
    }
}

function addSymbolTargets(symbol: SymbolReference, declarationIndex: DeclarationNodeIndex, targets: Set<string>): void {
    addDeclarationTargets(symbol.getDeclarations(), declarationIndex, targets);
    const aliased = symbol.getAliasedSymbol();
    if (aliased !== undefined) {
        addDeclarationTargets(aliased.getDeclarations(), declarationIndex, targets);
    }
}

function collectIdentifierTargets(rootNode: TsMorphNode, declarationIndex: DeclarationNodeIndex): Set<string> {
    const targets = new Set<string>();
    for (const identifier of rootNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
        const symbol = identifier.getSymbol();
        if (symbol !== undefined) {
            addSymbolTargets(symbol, declarationIndex, targets);
        }
    }
    return targets;
}

/** @internal Mutation-test helper for the traversal budget guard. */
export function takeTraversalIteration(remainingIterations: number): number {
    if (remainingIterations === 0) {
        throw new Error('Reachability traversal exceeded the maximum iteration budget');
    }
    return remainingIterations - 1;
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
    visited: Set<T>,
    queue: T[]
): void {
    for (const neighbor of expand(current)) {
        if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
        }
    }
}

function bfsClosure<T>(
    seeds: Iterable<T>,
    expand: (current: T) => Iterable<T>,
    initialVisited: ReadonlySet<T>,
    maximumNodeCount: number
): Set<T> {
    const seedList = Array.from(seeds);
    const maximumIterations = getMaximumTraversalIterations(initialVisited.size, seedList.length, maximumNodeCount);
    const traversalState = createTraversalState(initialVisited, seedList);

    for (const remainingIterations of createTraversalBudget(maximumIterations)) {
        const current = traversalState.queue.shift();
        if (current === undefined) {
            break;
        }
        takeTraversalIteration(remainingIterations);
        enqueueUnvisitedNeighbors(current, expand, traversalState.visited, traversalState.queue);
    }

    return traversalState.visited;
}

function addStatementSeeds(
    statements: readonly Statement[],
    declarationIndex: DeclarationNodeIndex,
    seeds: Set<string>
): void {
    for (const statement of statements) {
        for (const target of collectIdentifierTargets(statement, declarationIndex)) {
            seeds.add(target);
        }
    }
}

function gatherLocalSeeds(
    files: readonly FileBindings[],
    entryPointFilePaths: ReadonlySet<string>,
    declarationIndex: DeclarationNodeIndex
): Set<string> {
    const seeds = new Set<string>();
    for (const file of files) {
        const isEntry = entryPointFilePaths.has(file.sourceFilePath);
        for (const binding of file.bindings) {
            if (isEntry && binding.isExported) {
                seeds.add(bindingId(file.sourceFilePath, binding.name));
            }
        }
        addStatementSeeds(collectImpureStatements(file.sourceFile), declarationIndex, seeds);
    }
    return seeds;
}

const emptyStringSet: ReadonlySet<string> = new Set<string>();

export function buildReachabilityIndex(input: ReachabilityInput): ReachabilityIndex {
    const declarationIndex = buildDeclarationNodeIndex(input.files);
    const nodeById = buildNodeById(input.files);
    const maximumNodeCount = nodeById.size;
    const expand = (id: string): Iterable<string> => {
        const node = nodeById.get(id);
        return node === undefined ? emptyStringSet : collectIdentifierTargets(node, declarationIndex);
    };
    const localSeeds = gatherLocalSeeds(input.files, input.entryPointFilePaths, declarationIndex);
    const localReachable = bfsClosure(localSeeds, expand, emptyStringSet, maximumNodeCount);
    return {
        localReachable,
        bindingIdsByFile: buildBindingsByFile(input.files),
        expandWith(externalSeeds) {
            if (externalSeeds === undefined || externalSeeds.size === 0) {
                return localReachable;
            }
            return bfsClosure(externalSeeds, expand, localReachable, maximumNodeCount);
        }
    };
}
