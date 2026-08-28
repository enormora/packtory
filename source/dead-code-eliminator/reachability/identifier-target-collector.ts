import path from 'node:path';
import {
    Node as TsMorphNode,
    SyntaxKind,
    type Identifier,
    type ImportDeclaration,
    type ImportSpecifier,
    type ShorthandPropertyAssignment
} from 'ts-morph';

export type DeclarationNodeIndex = {
    readonly idsByNode: ReadonlyMap<TsMorphNode, readonly string[]>;
    readonly idsByFileAndName: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
};
type SymbolReference = NonNullable<ReturnType<Identifier['getSymbol']>>;

function declarationName(declaration: TsMorphNode): string {
    return declaration.getSymbolOrThrow().getName();
}

function declarationPathTargets(
    declaration: TsMorphNode,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    const name = declarationName(declaration);
    return declarationIndex.idsByFileAndName.get(declaration.getSourceFile().getFilePath())?.get(name) ?? [];
}

function importedFilePath(importDeclaration: ImportDeclaration): string {
    const sourceFilePath = importDeclaration.getSourceFile().getFilePath();
    return path.resolve(path.dirname(sourceFilePath), importDeclaration.getModuleSpecifierValue());
}

function isRelativeImport(importDeclaration: ImportDeclaration): boolean {
    return importDeclaration.getModuleSpecifierValue().startsWith('.');
}

function relativeImportSpecifierTargets(
    declaration: ImportSpecifier,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    const importDeclaration = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration);
    if (!isRelativeImport(importDeclaration)) {
        return [];
    }

    return declarationIndex.idsByFileAndName.get(importedFilePath(importDeclaration))?.get(declaration.getName()) ?? [];
}

function importSpecifierTargets(
    declaration: TsMorphNode,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    if (!TsMorphNode.isImportSpecifier(declaration)) {
        return [];
    }
    return relativeImportSpecifierTargets(declaration, declarationIndex);
}

function declarationTargets(
    declarations: readonly TsMorphNode[],
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    return declarations.flatMap(function (declaration) {
        return [
            ...declarationIndex.idsByNode.get(declaration) ?? [],
            ...declarationPathTargets(declaration, declarationIndex),
            ...importSpecifierTargets(declaration, declarationIndex)
        ];
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
