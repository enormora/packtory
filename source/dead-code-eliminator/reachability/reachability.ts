import { Node as TsMorphNode, SyntaxKind, type Identifier, type SourceFile, type Statement } from 'ts-morph';
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

function isImportSpecifierChild(identifier: Identifier): boolean {
    return TsMorphNode.isImportSpecifier(identifier.getParent());
}

function collectIdentifierTargets(rootNode: TsMorphNode, declarationIndex: DeclarationNodeIndex): Set<string> {
    const targets = new Set<string>();
    for (const identifier of rootNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
        if (!isImportSpecifierChild(identifier)) {
            addSymbolTargets(identifier.getSymbolOrThrow(), declarationIndex, targets);
        }
    }
    return targets;
}

function bfsClosure<T>(seeds: Iterable<T>, expand: (current: T) => Iterable<T>): Set<T> {
    const visited = new Set<T>(seeds);
    const queue = Array.from(visited);
    let current = queue.shift();
    while (current !== undefined) {
        for (const neighbor of expand(current)) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
        current = queue.shift();
    }
    return visited;
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

function gatherInitialSeeds(
    files: readonly FileBindings[],
    entryPointFilePaths: ReadonlySet<string>,
    declarationIndex: DeclarationNodeIndex,
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

export function computeReachability(input: ReachabilityInput): ReachabilityResult {
    const declarationIndex = buildDeclarationNodeIndex(input.files);
    const nodeById = buildNodeById(input.files);
    const seeds = gatherInitialSeeds(
        input.files,
        input.entryPointFilePaths,
        declarationIndex,
        input.externalSeeds ?? new Set<string>()
    );
    const reachable = bfsClosure(seeds, (id) => {
        const node = nodeById.get(id);
        return node === undefined ? [] : collectIdentifierTargets(node, declarationIndex);
    });
    return { reachable, bindingIdsByFile: buildBindingsByFile(input.files) };
}
