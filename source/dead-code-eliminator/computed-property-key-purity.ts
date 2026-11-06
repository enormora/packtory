import path from 'node:path';
import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type Expression,
    type Identifier,
    type ObjectLiteralExpression,
    type SourceFile,
    type VariableDeclaration
} from 'ts-morph';
import type { RuntimeModuleResolver } from './runtime-module-resolution.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { resolveImportedExpressionPropertyPath, type ImportedExpressionOrigin } from './imported-expression-origin.ts';

function objectPropertyInitializer(expression: ObjectLiteralExpression, propertyName: string): Expression | undefined {
    const property = expression.getProperty(propertyName);
    return TypeScriptMorphNode.isPropertyAssignment(property) ? property.getInitializerOrThrow() : undefined;
}

function primitiveKeyExpression(expression: Expression | undefined): boolean {
    return TypeScriptMorphNode.isStringLiteral(unwrapExpression(expression));
}

function symbolKeyIsPure(expression: Expression | undefined): boolean {
    if (!TypeScriptMorphNode.isCallExpression(expression)) {
        return false;
    }
    const target = expression.getExpression();
    return TypeScriptMorphNode.isIdentifier(target) && target.getText() === 'Symbol' &&
        target.getSymbol() === undefined && expression.getArguments().every(TypeScriptMorphNode.isStringLiteral);
}

function primitiveKeyLiteral(expression: Expression | undefined): boolean {
    return expression !== undefined && [
        SyntaxKind.StringLiteral,
        SyntaxKind.NumericLiteral,
        SyntaxKind.BigIntLiteral,
        SyntaxKind.TrueKeyword,
        SyntaxKind.FalseKeyword,
        SyntaxKind.NullKeyword,
        SyntaxKind.NoSubstitutionTemplateLiteral
    ]
        .includes(expression.getKind());
}

function constantKeyInitializer(expression: Identifier): Expression | undefined {
    const declaration = expression.getSymbol()?.getValueDeclaration();
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return undefined;
    }
    const initializedConstant =
        declaration.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const &&
        Math.sign(expression.getStart() - declaration.getEnd()) === 1;
    return initializedConstant ? declaration.getInitializer() : undefined;
}

function localExpressionIsPrimitiveKey(expression: Expression | undefined): boolean {
    const unwrapped = unwrapExpression(expression);
    if (!TypeScriptMorphNode.isIdentifier(unwrapped)) {
        return primitiveKeyLiteral(unwrapped) || symbolKeyIsPure(unwrapped);
    }
    if (unwrapped.getText() === 'undefined' && unwrapped.getSymbolOrThrow().getDeclarations().length === 0) {
        return true;
    }
    return localExpressionIsPrimitiveKey(constantKeyInitializer(unwrapped));
}

function expressionMemberIsPrimitiveKey(expression: Expression | undefined, propertyName: string): boolean {
    const unwrapped = unwrapExpression(expression);
    if (!TypeScriptMorphNode.isObjectLiteralExpression(unwrapped)) {
        return false;
    }
    return primitiveKeyExpression(objectPropertyInitializer(unwrapped, propertyName));
}

function constDeclarationInitializer(declaration: VariableDeclaration): Expression | undefined {
    const statement = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.VariableStatement);
    return statement.isExported() && statement.getDeclarationKind() === VariableDeclarationKind.Const
        ? declaration.getInitializer()
        : undefined;
}

function exportPathIsPrimitiveKey(
    sourceFile: SourceFile,
    origin: ImportedExpressionOrigin
): boolean {
    const [ exportName = origin.from, propertyName = exportName, ...rest ] = origin.path;
    const declaration = sourceFile.getVariableDeclaration(exportName);
    if (declaration === undefined) {
        return false;
    }
    return rest.length === 0 && expressionMemberIsPrimitiveKey(constDeclarationInitializer(declaration), propertyName);
}

function importedExpressionIsPrimitiveKey(expression: Expression, resolveModule: RuntimeModuleResolver): boolean {
    const origin = resolveImportedExpressionPropertyPath(expression);
    if (origin === undefined) {
        return false;
    }
    const sourceFile = resolveModule(origin.from, expression.getSourceFile());
    if (sourceFile === undefined || path.extname(sourceFile.getFilePath()) !== '.js') {
        return false;
    }
    return exportPathIsPrimitiveKey(sourceFile, origin);
}

export function computedPropertyNameIsPure(
    expression: Expression,
    resolveModule: RuntimeModuleResolver
): boolean {
    return localExpressionIsPrimitiveKey(expression) ||
        importedExpressionIsPrimitiveKey(expression, resolveModule);
}
