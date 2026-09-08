import {
    Node as TsMorphNode,
    SyntaxKind,
    type Identifier,
    type ImportDeclaration,
    type ImportSpecifier,
    type ShorthandPropertyAssignment
} from 'ts-morph';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';

export type DeclarationNodeIndex = {
    readonly idsByNode: ReadonlyMap<TsMorphNode, readonly string[]>;
    readonly idsByFileAndName: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
    readonly idsByTargetFileAndName: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
    readonly moduleReferencesByTargetFilePath: ReadonlyMap<string, readonly ArtifactModuleReference[]>;
    readonly targetFilePathByInputFilePath: ReadonlyMap<string, string>;
};
type SymbolReference = NonNullable<ReturnType<Identifier['getSymbol']>>;
type IdsByFileAndName = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;

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

function importerTargetFilePath(
    importDeclaration: ImportDeclaration,
    declarationIndex: DeclarationNodeIndex
): string | undefined {
    const inputFilePath = importDeclaration.getSourceFile().getFilePath();
    return declarationIndex.targetFilePathByInputFilePath.get(inputFilePath);
}

function isRelativeImport(importDeclaration: ImportDeclaration): boolean {
    return importDeclaration.getModuleSpecifierValue().startsWith('.');
}

function resolvedImportReference(
    importDeclaration: ImportDeclaration,
    declarationIndex: DeclarationNodeIndex
): ArtifactModuleReference | undefined {
    const importerPath = importerTargetFilePath(importDeclaration, declarationIndex);
    if (importerPath === undefined) {
        return undefined;
    }
    const specifier = importDeclaration.getModuleSpecifierValue();
    return declarationIndex.moduleReferencesByTargetFilePath.get(importerPath)?.find(function (reference) {
        return reference.emittedSpecifier === specifier;
    });
}

function missingReferenceError(importDeclaration: ImportDeclaration, importerPath: string): Error {
    return new Error(
        `Missing resolved module reference for "${importDeclaration.getModuleSpecifierValue()}" in "${importerPath}"`
    );
}

function relativeImportTargetPath(
    importDeclaration: ImportDeclaration,
    declarationIndex: DeclarationNodeIndex
): string | undefined {
    const importerPath = importerTargetFilePath(importDeclaration, declarationIndex);
    const reference = resolvedImportReference(importDeclaration, declarationIndex);
    if (reference === undefined) {
        if (importerPath !== undefined) {
            throw missingReferenceError(importDeclaration, importerPath);
        }
        return undefined;
    }
    return reference.type === 'local-code' ? reference.targetFilePath : undefined;
}

function targetsByFileAndName(
    idsByFileAndName: IdsByFileAndName,
    filePath: string | undefined,
    name: string
): readonly string[] {
    return filePath === undefined ? [] : idsByFileAndName.get(filePath)?.get(name) ?? [];
}

function relativeImportSpecifierTargets(
    declaration: ImportSpecifier,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    const importDeclaration = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration);
    if (!isRelativeImport(importDeclaration)) {
        return [];
    }

    return targetsByFileAndName(
        declarationIndex.idsByTargetFileAndName,
        relativeImportTargetPath(importDeclaration, declarationIndex),
        declaration.getName()
    );
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
