import { Node as TsMorphNode, SyntaxKind, type Expression, type Identifier } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { unwrapExpression } from './expression-unwrapping.ts';

export type ImportedExpressionOrigin = {
    readonly from: string;
    readonly path: readonly string[];
};

export type ExpressionPurityChecker = (expression: Expression) => boolean;

function importedOriginForDeclaration(declaration: TsMorphNode): ImportedExpressionOrigin | undefined {
    if (TsMorphNode.isImportSpecifier(declaration)) {
        return {
            from: declaration.getImportDeclaration().getModuleSpecifierValue(),
            path: [declaration.getName()]
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
            path: ['default']
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
    trustedImport: { readonly from: string; readonly imports?: readonly string[] | undefined }
): boolean {
    if (trustedImport.from !== origin.from) {
        return false;
    }
    if (trustedImport.imports === undefined) {
        return true;
    }
    const [pathHead = trustedImport.from] = origin.path;
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
    return pureImports.some((trustedImport) => {
        return originMatchesTrustedImport(origin, trustedImport);
    });
}

function arePureCallArguments(callArguments: readonly TsMorphNode[], recurse: ExpressionPurityChecker): boolean {
    return callArguments.every((argument) => {
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
    return base === undefined ? undefined : { from: base.from, path: [...base.path, propertyName] };
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

export function resolveImportedExpressionOrigin(
    expression: Expression,
    recurse: ExpressionPurityChecker,
    settings: DeadCodeEliminationSettings | undefined
): ImportedExpressionOrigin | undefined {
    const unwrapped = unwrapExpression(expression);
    if (TsMorphNode.isIdentifier(unwrapped)) {
        return importedOriginForIdentifier(unwrapped);
    }
    if (TsMorphNode.isPropertyAccessExpression(unwrapped)) {
        const base = resolveImportedExpressionOrigin(unwrapped.getExpression(), recurse, settings);
        return appendPropertyAccess(base, unwrapped.getName());
    }
    if (TsMorphNode.isCallExpression(unwrapped)) {
        const callee = resolveImportedExpressionOrigin(unwrapped.getExpression(), recurse, settings);
        return originOfTrustedCall(callee, unwrapped.getArguments(), recurse, settings);
    }
    return undefined;
}

export { arePureCallArguments };
