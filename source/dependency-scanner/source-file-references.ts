import Maybe, { first } from 'true-myth/maybe';
import { ts, Node, Project as _Project, SourceFile, Symbol as TSSymbol, SyntaxKind, StringLiteral } from 'ts-morph';

function getReferencedSourceFileFromSymbol(symbol: TSSymbol): Maybe<SourceFile> {
    const declarations = symbol.getDeclarations();

    return first(declarations).andThen((firstDeclaration) => {
        if (firstDeclaration.getKind() === SyntaxKind.SourceFile) {
            return Maybe.just(firstDeclaration as SourceFile);
        }

        return Maybe.nothing();
    });
}

function getSourceFileForLiteral(literal: StringLiteral): SourceFile | undefined {
    const parent = literal.getParentOrThrow();
    const grandParent = parent.getParent();

    if (Node.isImportDeclaration(parent) || Node.isExportDeclaration(parent)) {
        return parent.getModuleSpecifierSourceFile();
    } else if (grandParent != null && Node.isImportEqualsDeclaration(grandParent)) {
        return grandParent.getExternalModuleReferenceSourceFile();
    } else if (grandParent != null && Node.isImportTypeNode(grandParent)) {
        const importTypeSymbol = grandParent.getSymbol();
        if (importTypeSymbol != null) return getReferencedSourceFileFromSymbol(importTypeSymbol).unwrapOr(undefined);
    } else if (Node.isCallExpression(parent)) {
        const literalSymbol = literal.getSymbol();
        if (literalSymbol != null) {
            return getReferencedSourceFileFromSymbol(literalSymbol).unwrapOr(undefined);
        }
    }

    return undefined;
}

export function resolveSourceFileForLiteral(
    literal: StringLiteral,
    containingSourceFile: SourceFile,
): SourceFile | undefined {
    const project = containingSourceFile.getProject();
    const result = ts.resolveModuleName(
        literal.getLiteralValue(),
        containingSourceFile.getFilePath(),
        project.getCompilerOptions(),
        project.getModuleResolutionHost(),
    );

    if (result.resolvedModule) {
        const resolvedFilePath = result.resolvedModule.resolvedFileName;
        return project.getSourceFile(resolvedFilePath);
    }

    return undefined;
}

function isDefined<T>(value: T): value is Exclude<T, undefined> {
    return typeof value !== 'undefined';
}

export function getReferencedSourceFiles(sourceFile: SourceFile): SourceFile[] {
    const importStringLiterals = sourceFile.getImportStringLiterals();
    return importStringLiterals
        .map((literal) => {
            const referencedSourceFile = getSourceFileForLiteral(literal);

            if (referencedSourceFile) {
                return referencedSourceFile;
            }

            return resolveSourceFileForLiteral(literal, sourceFile);
        })
        .filter(isDefined);
}
