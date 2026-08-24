import { Node as TsMorphNode, SyntaxKind, type Expression, type Identifier } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { unwrapExpression } from './expression-unwrapping.ts';

export type ImportedExpressionOrigin = {
    readonly from: string;
    readonly path: readonly string[];
};

export type ExpressionPurityChecker = (expression: Expression) => boolean;

type TrustedImport = {
    readonly from: string;
    readonly imports?: readonly string[] | undefined;
};

type ImportedExpressionOriginResolver = (
    expression: Expression,
    recurse: ExpressionPurityChecker,
    settings: DeadCodeEliminationSettings | undefined
) => ImportedExpressionOrigin | undefined;

function importedOriginForDeclaration(declaration: TsMorphNode): ImportedExpressionOrigin | undefined {
    if (TsMorphNode.isImportSpecifier(declaration)) {
        return {
            from: declaration.getImportDeclaration().getModuleSpecifierValue(),
            path: [ declaration.getName() ]
        };
    }

    if (TsMorphNode.isNamespaceImport(declaration)) {
        const importDeclaration = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration);
        return {
            from: importDeclaration.getModuleSpecifierValue(),
            path: []
        };
    }

    if (TsMorphNode.isImportClause(declaration)) {
        const importDeclaration = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration);
        return {
            from: importDeclaration.getModuleSpecifierValue(),
            path: [ 'default' ]
        };
    }

    return undefined;
}

function importedOriginForIdentifier(identifier: Identifier): ImportedExpressionOrigin | undefined {
    const symbol = identifier.getSymbol();
    if (symbol === undefined) {
        return undefined;
    }

    for (const declaration of symbol.getDeclarations()) {
        const origin = importedOriginForDeclaration(declaration);
        if (origin !== undefined) {
            return origin;
        }
    }

    return undefined;
}

function originMatchesTrustedImport(
    origin: ImportedExpressionOrigin,
    trustedImport: TrustedImport
): boolean {
    if (trustedImport.from !== origin.from) {
        return false;
    }
    if (trustedImport.imports === undefined) {
        return true;
    }
    const [ pathHead = trustedImport.from ] = origin.path;
    return pathHead !== trustedImport.from && trustedImport.imports.includes(pathHead);
}

function expressionOriginIsTrusted(
    origin: ImportedExpressionOrigin | undefined,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    const pureImports = settings?.pureImports;
    if (origin === undefined || pureImports === undefined) {
        return false;
    }
    return pureImports.some(function (trustedImport) {
        return originMatchesTrustedImport(origin, trustedImport);
    });
}

function arePureCallArguments(callArguments: readonly TsMorphNode[], recurse: ExpressionPurityChecker): boolean {
    return callArguments.every(function (argument) {
        if (TsMorphNode.isSpreadElement(argument)) {
            return recurse(argument.getExpression());
        }
        return TsMorphNode.isExpression(argument) && recurse(argument);
    });
}

function appendPropertyAccess(
    base: ImportedExpressionOrigin | undefined,
    propertyName: string
): ImportedExpressionOrigin | undefined {
    return base === undefined ? undefined : { from: base.from, path: [ ...base.path, propertyName ] };
}

function originOfTrustedCall(
    callee: ImportedExpressionOrigin | undefined,
    callArguments: readonly TsMorphNode[],
    recurse: ExpressionPurityChecker,
    settings: DeadCodeEliminationSettings | undefined
): ImportedExpressionOrigin | undefined {
    if (!expressionOriginIsTrusted(callee, settings)) {
        return undefined;
    }
    return arePureCallArguments(callArguments, recurse) ? callee : undefined;
}

export function resolveImportedExpressionPath(expression: Expression): ImportedExpressionOrigin | undefined {
    const identifier = unwrapExpression(expression).asKind(SyntaxKind.Identifier);
    return identifier === undefined ? undefined : importedOriginForIdentifier(identifier);
}

function propertyAccessOrigin(
    expression: Expression,
    recurse: ExpressionPurityChecker,
    settings: DeadCodeEliminationSettings | undefined,
    resolveOrigin: ImportedExpressionOriginResolver
): ImportedExpressionOrigin | undefined {
    if (!TsMorphNode.isPropertyAccessExpression(expression)) {
        return undefined;
    }
    const base = resolveOrigin(expression.getExpression(), recurse, settings);
    return appendPropertyAccess(base, expression.getName());
}

function trustedCallOrigin(
    expression: Expression,
    recurse: ExpressionPurityChecker,
    settings: DeadCodeEliminationSettings | undefined,
    resolveOrigin: ImportedExpressionOriginResolver
): ImportedExpressionOrigin | undefined {
    if (!TsMorphNode.isCallExpression(expression)) {
        return undefined;
    }
    const callee = resolveOrigin(expression.getExpression(), recurse, settings);
    return originOfTrustedCall(callee, expression.getArguments(), recurse, settings);
}

export function resolveImportedExpressionOrigin(
    expression: Expression,
    recurse: ExpressionPurityChecker,
    settings: DeadCodeEliminationSettings | undefined
): ImportedExpressionOrigin | undefined {
    const unwrapped = unwrapExpression(expression);
    const directOrigin = resolveImportedExpressionPath(unwrapped);
    if (directOrigin !== undefined) {
        return directOrigin;
    }
    return propertyAccessOrigin(unwrapped, recurse, settings, resolveImportedExpressionOrigin) ??
        trustedCallOrigin(unwrapped, recurse, settings, resolveImportedExpressionOrigin);
}

export { arePureCallArguments };
