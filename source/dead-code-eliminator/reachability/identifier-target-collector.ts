import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Identifier,
    type ImportDeclaration,
    type ImportSpecifier,
    type ShorthandPropertyAssignment
} from 'ts-morph';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';

export type DeclarationNodeIndex = {
    readonly identifiersByNode: ReadonlyMap<TypeScriptMorphNode, readonly string[]>;
    readonly identifiersByFileAndName: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
    readonly identifiersByTargetFileAndName: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
    readonly moduleReferencesByTargetFilePath: ReadonlyMap<string, readonly ArtifactModuleReference[]>;
    readonly targetFilePathByInputFilePath: ReadonlyMap<string, string>;
};
type SymbolReference = NonNullable<ReturnType<Identifier['getSymbol']>>;
type IdentifiersByFileAndName = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;

function declarationName(declaration: TypeScriptMorphNode): string {
    return declaration.getSymbolOrThrow().getName();
}

function declarationPathTargets(
    declaration: TypeScriptMorphNode,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    const name = declarationName(declaration);
    return declarationIndex.identifiersByFileAndName.get(declaration.getSourceFile().getFilePath())?.get(name) ?? [];
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
    identifiersByFileAndName: IdentifiersByFileAndName,
    filePath: string | undefined,
    name: string
): readonly string[] {
    return filePath === undefined ? [] : identifiersByFileAndName.get(filePath)?.get(name) ?? [];
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
        declarationIndex.identifiersByTargetFileAndName,
        relativeImportTargetPath(importDeclaration, declarationIndex),
        declaration.getName()
    );
}

function importSpecifierTargets(
    declaration: TypeScriptMorphNode,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    if (!TypeScriptMorphNode.isImportSpecifier(declaration)) {
        return [];
    }
    return relativeImportSpecifierTargets(declaration, declarationIndex);
}

function declarationTargets(
    declarations: readonly TypeScriptMorphNode[],
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    return declarations.flatMap(function (declaration) {
        return [
            ...declarationIndex.identifiersByNode.get(declaration) ?? [],
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

function namespaceExportTargets(
    symbol: SymbolReference,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    if (!symbol.getDeclarations().some(TypeScriptMorphNode.isNamespaceImport)) {
        return [];
    }
    return symbol.getAliasedSymbolOrThrow().getExports().flatMap(function (exported) {
        return symbolTargets(exported, declarationIndex);
    });
}

function observesNamespace(identifier: Identifier): boolean {
    const parent = identifier.getParent();
    return !TypeScriptMorphNode.isNamespaceImport(parent) &&
        !TypeScriptMorphNode.isPropertyAccessExpression(parent);
}

function identifierTargets(identifier: Identifier, declarationIndex: DeclarationNodeIndex): readonly string[] {
    const parent = identifier.getParent();
    const symbol = TypeScriptMorphNode.isExportSpecifier(parent)
        ? parent.getLocalTargetSymbol() ?? identifier.getSymbol()
        : identifier.getSymbol();
    return symbol === undefined ? [] : [
        ...symbolTargets(symbol, declarationIndex),
        ...observesNamespace(identifier) ? namespaceExportTargets(symbol, declarationIndex) : []
    ];
}

function shorthandPropertyTargets(
    rootNode: TypeScriptMorphNode,
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
            targets.push(
                ...symbolTargets(valueSymbol, declarationIndex),
                ...namespaceExportTargets(valueSymbol, declarationIndex)
            );
        }
    }
    return targets;
}

export function collectIdentifierTargets(
    rootNode: TypeScriptMorphNode,
    declarationIndex: DeclarationNodeIndex
): Set<string> {
    return new Set([
        ...rootNode.getDescendantsOfKind(SyntaxKind.Identifier).flatMap(function (identifier) {
            return identifierTargets(identifier, declarationIndex);
        }),
        ...shorthandPropertyTargets(rootNode, declarationIndex)
    ]);
}
