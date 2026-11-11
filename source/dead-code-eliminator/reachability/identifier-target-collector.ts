import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type CallExpression,
    type ExportDeclaration,
    type Identifier,
    type ImportClause,
    type ImportDeclaration,
    type ImportSpecifier,
    type ShorthandPropertyAssignment,
    type SourceFile
} from 'ts-morph';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';
import type { ExportGraph } from '../exports/export-graph.ts';
import { visitBindingDependencies } from '../exports/binding-dependencies.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { dynamicImportProperties } from './dynamic-import-properties.ts';

import type { DeclarationNodeIndex } from './binding-identifier.ts';

type IdentifierTargetIndex = DeclarationNodeIndex & {
    readonly exportGraph: ExportGraph | undefined;
};
type SymbolReference = NonNullable<ReturnType<Identifier['getSymbol']>>;
type IdentifiersByFileAndName = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;

function declarationName(declaration: TypeScriptMorphNode): string {
    return declaration.getSymbolOrThrow().getName();
}

function declarationPathTargets(
    declaration: TypeScriptMorphNode,
    declarationIndex: IdentifierTargetIndex
): readonly string[] {
    const name = declarationName(declaration);
    return declarationIndex.identifiersByFileAndName.get(declaration.getSourceFile().getFilePath())?.get(name) ?? [];
}

function importerTargetFilePath(
    node: TypeScriptMorphNode,
    declarationIndex: IdentifierTargetIndex
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
    declarationIndex: IdentifierTargetIndex
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
    declarationIndex: IdentifierTargetIndex
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
    declarationIndex: IdentifierTargetIndex
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
    declarationIndex: IdentifierTargetIndex
): readonly string[] {
    if (!TypeScriptMorphNode.isImportSpecifier(declaration) && !TypeScriptMorphNode.isImportClause(declaration)) {
        return [];
    }
    return declarationIndex.exportGraph?.importedTargets(declaration) ??
        relativeImportBindingTargets(declaration, declarationIndex);
}

function declarationTargets(
    declarations: readonly TypeScriptMorphNode[],
    declarationIndex: IdentifierTargetIndex
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
    declarationIndex: IdentifierTargetIndex
): readonly string[] {
    const aliased = symbol.getAliasedSymbol();
    return [
        ...declarationTargets(symbol.getDeclarations(), declarationIndex),
        ...aliased === undefined ? [] : declarationTargets(aliased.getDeclarations(), declarationIndex)
    ];
}

function compilerReExportDependencies(
    declaration: ExportDeclaration,
    declarationIndex: IdentifierTargetIndex
): readonly (ExportDeclaration | string)[] {
    const source = declaration.isNamespaceExport() ? declaration.getModuleSpecifierSourceFile() : undefined;
    if (source === undefined) {
        return [];
    }
    return [
        ...source.getExportSymbols().flatMap(function (symbol) {
            return symbol.getName() !== 'default' || declaration.getNamespaceExport() !== undefined
                ? symbolTargets(symbol, declarationIndex)
                : [];
        }),
        ...source.getExportDeclarations()
    ];
}

function reExportTargets(
    declaration: ExportDeclaration,
    declarationIndex: IdentifierTargetIndex
): readonly string[] {
    const targets = new Set<string>();
    visitBindingDependencies<ExportDeclaration | string>(declaration, {
        get(node) {
            return typeof node === 'string' ? undefined : function () {
                return declarationIndex.exportGraph?.declarationTargets(node) ??
                    compilerReExportDependencies(node, declarationIndex);
            };
        }
    }, function (node) {
        if (typeof node === 'string') {
            targets.add(node);
        }
    });
    return Array.from(targets);
}

function namespaceExportTargets(
    symbol: SymbolReference,
    declarationIndex: IdentifierTargetIndex
): readonly string[] {
    const declarations = symbol.getDeclarations();
    const graph = declarationIndex.exportGraph;
    const usesRuntimeGraph = graph !== undefined && declarations.every(function (declaration) {
        return graph.owns(declaration.getSourceFile()) &&
            declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.isTypeOnly() !== true &&
            (!TypeScriptMorphNode.isImportSpecifier(declaration) || !declaration.isTypeOnly());
    });
    if (usesRuntimeGraph) {
        return declarations.flatMap(graph.namespaceBindingTargets);
    }
    if (!declarations.some(TypeScriptMorphNode.isNamespaceImport)) {
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

function identifierSymbol(identifier: Identifier): SymbolReference | undefined {
    const parent = identifier.getParent();
    return TypeScriptMorphNode.isExportSpecifier(parent)
        ? parent.getLocalTargetSymbol()
        : identifier.getSymbol();
}

function identifierTargets(identifier: Identifier, declarationIndex: IdentifierTargetIndex): readonly string[] {
    const symbol = identifierSymbol(identifier);
    const runtimeReference = identifier.getFirstAncestor(TypeScriptMorphNode.isTypeNode) === undefined;
    const index = runtimeReference ? declarationIndex : { ...declarationIndex, exportGraph: undefined };
    return symbol === undefined ? [] : [
        ...symbolTargets(symbol, index),
        ...index.exportGraph?.owns(identifier.getSourceFile()) === true || observesNamespace(identifier)
            ? namespaceExportTargets(symbol, index)
            : []
    ];
}

function shorthandPropertyTargets(
    rootNode: TypeScriptMorphNode,
    declarationIndex: IdentifierTargetIndex
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
    declarationIndex: IdentifierTargetIndex
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

function observedDynamicExports(
    call: CallExpression,
    sourceFile: SourceFile,
    declarationIndex: IdentifierTargetIndex
): readonly string[] {
    const properties = dynamicImportProperties(call, sourceFile);
    return [
        ...sourceFile
            .getExportSymbols()
            .filter(function (symbol) {
                return properties === undefined || properties.has(symbol.getName());
            })
            .flatMap(function (symbol) {
                return symbolTargets(symbol, declarationIndex);
            }),
        ...sourceFile.getExportDeclarations().flatMap(function (declaration) {
            return reExportTargets(declaration, declarationIndex);
        })
    ];
}

function dynamicImportTargets(
    call: CallExpression,
    declarationIndex: IdentifierTargetIndex
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
    return sourceFile === undefined ? [] : observedDynamicExports(call, sourceFile, declarationIndex);
}

export function collectIdentifierTargets(
    rootNode: TypeScriptMorphNode,
    declarationIndex: DeclarationNodeIndex,
    exportGraph: ExportGraph | undefined
): Set<string> {
    const index = { ...declarationIndex, exportGraph };
    return new Set([
        ...TypeScriptMorphNode.isExportDeclaration(rootNode)
            ? reExportTargets(rootNode, index)
            : [],
        ...rootNode.getDescendantsOfKind(SyntaxKind.Identifier).flatMap(function (identifier) {
            return identifierTargets(identifier, index);
        }),
        ...shorthandPropertyTargets(rootNode, index),
        ...rootNode.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap(function (call) {
            const dynamicTargets = index.exportGraph?.dynamicTargets(call) ?? dynamicImportTargets(call, index);
            return [ ...dynamicTargets, ...directEvalTargets(call, index) ];
        })
    ]);
}
