import { Node as TypeScriptMorphNode, SyntaxKind, type Expression, type Identifier } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import type { RuntimeModuleResolver } from './runtime-module-resolution.ts';
import { unwrapExpression } from './expression-unwrapping.ts';

export type ImportedExpressionOrigin = {
    readonly from: string;
    readonly path: readonly (string | { readonly type: 'call-result'; })[];
};

export function callResultPath(path: ImportedExpressionOrigin['path']): ImportedExpressionOrigin['path'] {
    return [ ...path, { type: 'call-result' } ];
}

export function callResultOrigin(origin: ImportedExpressionOrigin): ImportedExpressionOrigin {
    return { from: origin.from, path: callResultPath(origin.path) };
}

export type ExpressionPurityChecker = (expression: Expression) => boolean;

export type PurityContext = {
    readonly settings: DeadCodeEliminationSettings | undefined;
    readonly resolveRuntimeModule: RuntimeModuleResolver;
};

type TrustedImport = {
    readonly from: string;
    readonly imports?: readonly string[] | undefined;
};

function importedOriginForDeclaration(declaration: TypeScriptMorphNode): ImportedExpressionOrigin | undefined {
    if (TypeScriptMorphNode.isImportSpecifier(declaration)) {
        return {
            from: declaration.getImportDeclaration().getModuleSpecifierValue(),
            path: [ declaration.getName() ]
        };
    }

    if (TypeScriptMorphNode.isNamespaceImport(declaration)) {
        const importDeclaration = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration);
        return {
            from: importDeclaration.getModuleSpecifierValue(),
            path: []
        };
    }

    if (TypeScriptMorphNode.isImportClause(declaration)) {
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
    return trustedImport.imports.some(function (name) {
        return name !== trustedImport.from && name === origin.path[0];
    });
}

export function originIsTrustedPureImport(
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

function arePureCallArguments(
    callArguments: readonly TypeScriptMorphNode[],
    recurse: ExpressionPurityChecker
): boolean {
    return callArguments.every(function (argument) {
        if (TypeScriptMorphNode.isSpreadElement(argument)) {
            return false;
        }
        return TypeScriptMorphNode.isExpression(argument) && recurse(argument);
    });
}

export function resolveImportedExpressionPath(expression: Expression): ImportedExpressionOrigin | undefined {
    const identifier = unwrapExpression(expression).asKind(SyntaxKind.Identifier);
    return identifier === undefined ? undefined : importedOriginForIdentifier(identifier);
}

export function resolveImportedExpressionPropertyPath(expression: Expression): ImportedExpressionOrigin | undefined {
    const unwrapped = unwrapExpression(expression);
    if (TypeScriptMorphNode.isIdentifier(unwrapped)) {
        return resolveImportedExpressionPath(unwrapped);
    }
    if (TypeScriptMorphNode.isPropertyAccessExpression(unwrapped)) {
        const base = resolveImportedExpressionPropertyPath(unwrapped.getExpression());
        return base === undefined ? undefined : { from: base.from, path: [ ...base.path, unwrapped.getName() ] };
    }
    return undefined;
}

export { arePureCallArguments };
