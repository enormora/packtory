import path from 'node:path';
import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type Expression,
    type ObjectLiteralExpression,
    type SourceFile,
    type VariableDeclaration
} from 'ts-morph';
import type { RuntimeModuleResolver } from './runtime-module-resolution.ts';
import { expressionFactIsPure, type ExpressionFactResolver } from './expression-facts.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { resolveImportedExpressionPropertyPath, type ImportedExpressionOrigin } from './imported-expression-origin.ts';

function objectPropertyInitializer(expression: ObjectLiteralExpression, propertyName: string): Expression | undefined {
    const property = expression.getProperty(propertyName);
    return TypeScriptMorphNode.isPropertyAssignment(property) ? property.getInitializerOrThrow() : undefined;
}

function primitiveKeyExpression(expression: Expression | undefined): boolean {
    return TypeScriptMorphNode.isStringLiteral(unwrapExpression(expression));
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
    factFor: ExpressionFactResolver,
    resolveModule: RuntimeModuleResolver
): boolean {
    if (TypeScriptMorphNode.isPropertyAccessExpression(unwrapExpression(expression))) {
        return importedExpressionIsPrimitiveKey(expression, resolveModule);
    }
    return expressionFactIsPure(factFor(expression)) || importedExpressionIsPrimitiveKey(expression, resolveModule);
}
