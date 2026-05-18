import { SyntaxKind, type Identifier, type Node as TsMorphNode, type ShorthandPropertyAssignment } from 'ts-morph';

export type DeclarationNodeIndex = ReadonlyMap<TsMorphNode, string>;
type SymbolReference = NonNullable<ReturnType<Identifier['getSymbol']>>;

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

function addShorthandPropertyTargets(
    rootNode: TsMorphNode,
    declarationIndex: DeclarationNodeIndex,
    targets: Set<string>
): void {
    for (const shorthand of rootNode.getDescendantsOfKind(
        SyntaxKind.ShorthandPropertyAssignment
    ) as readonly ShorthandPropertyAssignment[]) {
        const valueSymbol = shorthand.getValueSymbol();
        if (valueSymbol !== undefined) {
            addSymbolTargets(valueSymbol, declarationIndex, targets);
        }
    }
}

export function collectIdentifierTargets(rootNode: TsMorphNode, declarationIndex: DeclarationNodeIndex): Set<string> {
    const targets = new Set<string>();
    for (const identifier of rootNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
        const symbol = identifier.getSymbol();
        if (symbol !== undefined) {
            addSymbolTargets(symbol, declarationIndex, targets);
        }
    }
    addShorthandPropertyTargets(rootNode, declarationIndex, targets);
    return targets;
}
