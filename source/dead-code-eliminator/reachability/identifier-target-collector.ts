import { SyntaxKind, type Identifier, type Node as TsMorphNode, type ShorthandPropertyAssignment } from 'ts-morph';

export type DeclarationNodeIndex = ReadonlyMap<TsMorphNode, string>;
type SymbolReference = NonNullable<ReturnType<Identifier['getSymbol']>>;

function declarationTargets(
    declarations: readonly TsMorphNode[],
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    return declarations.flatMap(function (declaration) {
        const candidate = declarationIndex.get(declaration);
        return candidate === undefined ? [] : [ candidate ];
    });
}

function symbolTargets(
    symbol: SymbolReference,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    const aliased = symbol.getAliasedSymbol();
    return [
        ...declarationTargets(symbol.getDeclarations(), declarationIndex),
        ...aliased === undefined ? [] : declarationTargets(aliased.getDeclarations(), declarationIndex)
    ];
}

function shorthandPropertyTargets(
    rootNode: TsMorphNode,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    const targets: string[] = [];
    for (
        const shorthand of rootNode.getDescendantsOfKind(
            SyntaxKind.ShorthandPropertyAssignment
        ) as readonly ShorthandPropertyAssignment[]
    ) {
        const valueSymbol = shorthand.getValueSymbol();
        if (valueSymbol !== undefined) {
            targets.push(...symbolTargets(valueSymbol, declarationIndex));
        }
    }
    return targets;
}

export function collectIdentifierTargets(rootNode: TsMorphNode, declarationIndex: DeclarationNodeIndex): Set<string> {
    const targets = new Set<string>();
    for (const identifier of rootNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
        const symbol = identifier.getSymbol();
        if (symbol !== undefined) {
            for (const target of symbolTargets(symbol, declarationIndex)) {
                targets.add(target);
            }
        }
    }
    for (const target of shorthandPropertyTargets(rootNode, declarationIndex)) {
        targets.add(target);
    }
    return targets;
}
