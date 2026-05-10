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
    readonly externalSeeds?: ReadonlySet<string> | undefined;
};

export type ReachabilityResult = {
    readonly reachable: ReadonlySet<string>;
    readonly bindingIdsByFile: ReadonlyMap<string, ReadonlySet<string>>;
};

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

function addDeclarationTargets(
    declarations: readonly TsMorphNode[],
    declarationIndex: ReadonlyMap<TsMorphNode, string>,
    targets: Set<string>
): void {
    for (const declaration of declarations) {
        const candidate = declarationIndex.get(declaration);
        if (candidate !== undefined) {
            targets.add(candidate);
        }
    }
}

type SymbolReference = NonNullable<ReturnType<Identifier['getSymbol']>>;

function addSymbolTargets(
    symbol: SymbolReference,
    declarationIndex: ReadonlyMap<TsMorphNode, string>,
    targets: Set<string>
): void {
    addDeclarationTargets(symbol.getDeclarations(), declarationIndex, targets);
    const aliased = symbol.getAliasedSymbol();
    if (aliased !== undefined) {
        addDeclarationTargets(aliased.getDeclarations(), declarationIndex, targets);
    }
}

function collectIdentifierTargets(
    rootNode: TsMorphNode,
    declarationIndex: ReadonlyMap<TsMorphNode, string>
): Set<string> {
    const targets = new Set<string>();
    for (const identifier of rootNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
        const symbol = identifier.getSymbol();
        if (symbol !== undefined) {
            addSymbolTargets(symbol, declarationIndex, targets);
        }
    }
    return targets;
}

function buildEdgeMap(
    files: readonly FileBindings[],
    declarationIndex: ReadonlyMap<TsMorphNode, string>
): Map<string, ReadonlySet<string>> {
    const edges = new Map<string, ReadonlySet<string>>();
    for (const file of files) {
        for (const binding of file.bindings) {
            const sourceId = bindingId(file.sourceFilePath, binding.name);
            edges.set(sourceId, collectIdentifierTargets(binding.declarationNode, declarationIndex));
        }
    }
    return edges;
}

function addStatementSeeds(
    statements: readonly Statement[],
    declarationIndex: ReadonlyMap<TsMorphNode, string>,
    seeds: Set<string>
): void {
    for (const statement of statements) {
        for (const target of collectIdentifierTargets(statement, declarationIndex)) {
            seeds.add(target);
        }
    }
}

function gatherInitialSeeds(
    files: readonly FileBindings[],
    entryPointFilePaths: ReadonlySet<string>,
    declarationIndex: ReadonlyMap<TsMorphNode, string>,
    externalSeeds: ReadonlySet<string>
): Set<string> {
    const seeds = new Set<string>(externalSeeds);
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

function expandFrontier(
    current: string,
    edges: ReadonlyMap<string, ReadonlySet<string>>,
    reachable: Set<string>,
    queue: string[]
): void {
    const targets = edges.get(current);
    if (targets === undefined) {
        return;
    }
    for (const target of targets) {
        if (!reachable.has(target)) {
            reachable.add(target);
            queue.push(target);
        }
    }
}

function bfsReachable(seeds: ReadonlySet<string>, edges: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
    const reachable = new Set<string>(seeds);
    const queue = Array.from(seeds);
    let current = queue.shift();
    while (current !== undefined) {
        expandFrontier(current, edges, reachable, queue);
        current = queue.shift();
    }
    return reachable;
}

export function computeReachability(input: ReachabilityInput): ReachabilityResult {
    const declarationIndex = buildDeclarationNodeIndex(input.files);
    const edges = buildEdgeMap(input.files, declarationIndex);
    const seeds = gatherInitialSeeds(
        input.files,
        input.entryPointFilePaths,
        declarationIndex,
        input.externalSeeds ?? new Set<string>()
    );
    const reachable = bfsReachable(seeds, edges);
    return {
        reachable,
        bindingIdsByFile: buildBindingsByFile(input.files)
    };
}
