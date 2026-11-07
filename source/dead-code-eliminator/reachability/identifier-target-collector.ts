import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type CallExpression,
    type ExportDeclaration,
    type Identifier,
    type ImportClause,
    type ImportDeclaration,
    type ImportSpecifier,
    type ShorthandPropertyAssignment
} from 'ts-morph';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';

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
    node: TypeScriptMorphNode,
    declarationIndex: DeclarationNodeIndex
): string | undefined {
    const inputFilePath = node.getSourceFile().getFilePath();
    return declarationIndex.targetFilePathByInputFilePath.get(inputFilePath);
}

function isRelativeImport(importDeclaration: ImportDeclaration): boolean {
    return importDeclaration.getModuleSpecifierValue().startsWith('.');
}

function resolvedModuleReference(
    node: TypeScriptMorphNode,
    specifier: string,
    declarationIndex: DeclarationNodeIndex
): ArtifactModuleReference | undefined {
    const importerPath = importerTargetFilePath(node, declarationIndex);
    if (importerPath === undefined) {
        return undefined;
    }
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
    const reference = resolvedModuleReference(
        importDeclaration,
        importDeclaration.getModuleSpecifierValue(),
        declarationIndex
    );
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

function relativeImportBindingTargets(
    declaration: ImportClause | ImportSpecifier,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    const importDeclaration = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration);
    if (!isRelativeImport(importDeclaration)) {
        return [];
    }

    return targetsByFileAndName(
        declarationIndex.identifiersByTargetFileAndName,
        relativeImportTargetPath(importDeclaration, declarationIndex),
        TypeScriptMorphNode.isImportClause(declaration) ? 'default' : declaration.getName()
    );
}

function importBindingTargets(
    declaration: TypeScriptMorphNode,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    if (!TypeScriptMorphNode.isImportSpecifier(declaration) && !TypeScriptMorphNode.isImportClause(declaration)) {
        return [];
    }
    return relativeImportBindingTargets(declaration, declarationIndex);
}

function declarationTargets(
    declarations: readonly TypeScriptMorphNode[],
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    return declarations.flatMap(function (declaration) {
        return [
            ...declarationIndex.identifiersByNode.get(declaration) ?? [],
            ...declarationPathTargets(declaration, declarationIndex),
            ...importBindingTargets(declaration, declarationIndex)
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

function reExportTargets(
    declaration: ExportDeclaration,
    declarationIndex: DeclarationNodeIndex,
    visited: ReadonlySet<ExportDeclaration>
): readonly string[] {
    if (!declaration.isNamespaceExport() || visited.has(declaration)) {
        return [];
    }
    const sourceFile = declaration.getModuleSpecifierSourceFile();
    if (sourceFile === undefined) {
        return [];
    }
    const nextVisited = new Set([ ...visited, declaration ]);
    return [
        ...sourceFile.getExportSymbols().flatMap(function (symbol) {
            return symbol.getName() !== 'default' || declaration.getNamespaceExport() !== undefined
                ? symbolTargets(symbol, declarationIndex)
                : [];
        }),
        ...sourceFile.getExportDeclarations().flatMap(function (nested) {
            return reExportTargets(nested, declarationIndex, nextVisited);
        })
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

function directEvalTargets(
    call: CallExpression,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    const expression = unwrapExpression(call.getExpression());
    if (
        !TypeScriptMorphNode.isIdentifier(expression) || expression.getText() !== 'eval' || call.hasQuestionDotToken()
    ) {
        return [];
    }
    const sourceFile = call.getSourceFile();
    return [
        ...Array.from(declarationIndex.identifiersByFileAndName.get(sourceFile.getFilePath())?.values() ?? []).flat(),
        ...sourceFile.getImportDeclarations().flatMap(function (declaration) {
            const symbol = declaration.getNamespaceImport()?.getSymbol();
            return symbol === undefined ? [] : namespaceExportTargets(symbol, declarationIndex);
        })
    ];
}

function dynamicImportTargets(
    call: CallExpression,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
        return [];
    }
    const [ argument ] = call.getArguments();
    if (!TypeScriptMorphNode.isStringLiteral(argument)) {
        return [];
    }
    const reference = resolvedModuleReference(call, argument.getLiteralValue(), declarationIndex);
    if (reference?.type !== 'local-code') {
        return [];
    }
    const sourceFile = call.getProject().getSourceFiles().find(function (candidate) {
        return declarationIndex.targetFilePathByInputFilePath.get(candidate.getFilePath()) === reference.targetFilePath;
    });
    return sourceFile === undefined ? [] : [
        ...sourceFile.getExportSymbols().flatMap(function (symbol) {
            return symbolTargets(symbol, declarationIndex);
        }),
        ...sourceFile.getExportDeclarations().flatMap(function (declaration) {
            return reExportTargets(declaration, declarationIndex, new Set());
        })
    ];
}

export function collectIdentifierTargets(
    rootNode: TypeScriptMorphNode,
    declarationIndex: DeclarationNodeIndex
): Set<string> {
    return new Set([
        ...TypeScriptMorphNode.isExportDeclaration(rootNode)
            ? reExportTargets(rootNode, declarationIndex, new Set())
            : [],
        ...rootNode.getDescendantsOfKind(SyntaxKind.Identifier).flatMap(function (identifier) {
            return identifierTargets(identifier, declarationIndex);
        }),
        ...shorthandPropertyTargets(rootNode, declarationIndex),
        ...rootNode.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap(function (call) {
            return [ ...dynamicImportTargets(call, declarationIndex), ...directEvalTargets(call, declarationIndex) ];
        })
    ]);
}
