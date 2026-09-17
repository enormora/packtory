import path from 'node:path';
import {
    Node as TsMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type Expression,
    type ObjectLiteralExpression,
    type SourceFile,
    type VariableDeclaration
} from 'ts-morph';
import {
    packageTypeForResolvedFilePath,
    resolveTypescriptModuleFilePath
} from '../dependency-scanner/typescript-module-resolution.ts';
import { expressionFactIsPure, type ExpressionFactResolver } from './expression-facts.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { resolveImportedExpressionPropertyPath } from './imported-expression-origin.ts';

function packageTypeFor(filePath: string, containingSourceFile: SourceFile): string | undefined {
    return packageTypeForResolvedFilePath({ filePath, containingSourceFile });
}

function isRuntimeModuleSource(filePath: string, containingSourceFile: SourceFile): boolean {
    return path.extname(filePath) === '.js' && packageTypeFor(filePath, containingSourceFile) === 'module';
}

function resolvedRuntimeSourceFile(
    moduleSpecifier: string,
    containingSourceFile: SourceFile
): SourceFile | undefined {
    const filePath = resolveTypescriptModuleFilePath({
        moduleSpecifier,
        containingSourceFile,
        resolutionMode: 'runtime'
    });
    if (filePath === undefined || !isRuntimeModuleSource(filePath, containingSourceFile)) {
        return undefined;
    }
    const project = containingSourceFile.getProject();
    return project.getSourceFile(filePath) ?? project.addSourceFileAtPathIfExists(filePath);
}

function objectPropertyInitializer(expression: ObjectLiteralExpression, propertyName: string): Expression | undefined {
    const property = expression.getProperty(propertyName);
    return TsMorphNode.isPropertyAssignment(property) ? property.getInitializerOrThrow() : undefined;
}

function primitiveKeyExpression(expression: Expression | undefined): boolean {
    return TsMorphNode.isStringLiteral(unwrapExpression(expression));
}

function expressionMemberIsPrimitiveKey(expression: Expression | undefined, propertyName: string): boolean {
    const unwrapped = unwrapExpression(expression);
    if (!TsMorphNode.isObjectLiteralExpression(unwrapped)) {
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
    exportName: string,
    propertyName: string
): boolean {
    const declaration = sourceFile.getVariableDeclaration(exportName);
    if (declaration === undefined) {
        return false;
    }
    return expressionMemberIsPrimitiveKey(constDeclarationInitializer(declaration), propertyName);
}

function importedExpressionIsPrimitiveKey(expression: Expression): boolean {
    const origin = resolveImportedExpressionPropertyPath(expression);
    if (origin === undefined) {
        return false;
    }
    const sourceFile = resolvedRuntimeSourceFile(origin.from, expression.getSourceFile());
    const [ exportName = origin.from, propertyName = exportName, ...rest ] = origin.path;
    return sourceFile !== undefined && rest.length === 0 &&
        exportPathIsPrimitiveKey(sourceFile, exportName, propertyName);
}

export function computedPropertyNameIsPure(
    expression: Expression,
    factFor: ExpressionFactResolver
): boolean {
    if (TsMorphNode.isPropertyAccessExpression(unwrapExpression(expression))) {
        return importedExpressionIsPrimitiveKey(expression);
    }
    return expressionFactIsPure(factFor(expression)) || importedExpressionIsPrimitiveKey(expression);
}
