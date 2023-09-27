import { isBuiltin } from 'node:module';
import Maybe, { first } from 'true-myth/maybe';
import {
    ts,
    Node as ASTNode,
    type SourceFile,
    type Symbol as TSSymbol,
    SyntaxKind,
    type StringLiteral
} from 'ts-morph';

function getReferencedSourceFileFromSymbol(symbol: TSSymbol | undefined): Readonly<Maybe<SourceFile>> {
    if (symbol === undefined) {
        return Maybe.nothing();
    }

    const declarations = symbol.getDeclarations();

    return first(declarations).andThen((firstDeclaration) => {
        if (firstDeclaration.getKind() === SyntaxKind.SourceFile) {
            return Maybe.just(firstDeclaration as SourceFile);
        }

        return Maybe.nothing();
    });
}

function getSourceFileFromSymbol(
    literal: StringLiteral,
    parent: ASTNode,
    grandParent: ASTNode | undefined
): Readonly<Maybe<SourceFile>> {
    if (ASTNode.isImportTypeNode(grandParent)) {
        return getReferencedSourceFileFromSymbol(grandParent.getSymbol());
    }
    if (ASTNode.isCallExpression(parent)) {
        return getReferencedSourceFileFromSymbol(literal.getSymbol());
    }

    return Maybe.nothing();
}

function getSourceFileForLiteral(literal: StringLiteral): Readonly<SourceFile | undefined> {
    const parent = literal.getParentOrThrow();
    const grandParent = parent.getParent();

    if (ASTNode.isImportDeclaration(parent) || ASTNode.isExportDeclaration(parent)) {
        return parent.getModuleSpecifierSourceFile();
    }
    if (ASTNode.isImportEqualsDeclaration(grandParent)) {
        return grandParent.getExternalModuleReferenceSourceFile();
    }

    return getSourceFileFromSymbol(literal, parent, grandParent).unwrapOr(undefined);
}

export function resolveSourceFileForLiteral(
    literal: StringLiteral,
    containingSourceFile: Readonly<SourceFile>
): Readonly<SourceFile | undefined> {
    const project = containingSourceFile.getProject();
    const result = ts.resolveModuleName(
        literal.getLiteralValue(),
        containingSourceFile.getFilePath(),
        project.getCompilerOptions(),
        project.getModuleResolutionHost()
    );

    if (result.resolvedModule !== undefined) {
        const resolvedFilePath = result.resolvedModule.resolvedFileName;
        return project.getSourceFile(resolvedFilePath);
    }

    return undefined;
}

function isDefined<T>(value: T): value is Exclude<T, undefined> {
    return value !== undefined;
}

export function getReferencedSourceFiles(sourceFile: Readonly<SourceFile>): readonly Readonly<SourceFile>[] {
    const importStringLiterals = sourceFile.getImportStringLiterals();
    return importStringLiterals
        .map((literal) => {
            let referencedSourceFile = getSourceFileForLiteral(literal);

            if (referencedSourceFile === undefined) {
                referencedSourceFile = resolveSourceFileForLiteral(literal, sourceFile);
            }

            if (referencedSourceFile === undefined) {
                const importValue = literal.getLiteralValue();

                if (isBuiltin(importValue)) {
                    return undefined;
                }

                const message = `Failed to resolve import "${importValue}" in file "${sourceFile.getFilePath()}"`;

                throw new Error(message);
            }

            return referencedSourceFile;
        })
        .filter(isDefined);
}
