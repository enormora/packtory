import {
    Node as TsMorphNode,
    type Expression,
    type ImportDeclaration,
    type SourceFile,
    type Statement
} from 'ts-morph';
import { childModuleGuardContext, type ConstantContext } from './constant-context.ts';
import { sideEffectAssetImportKind } from './liveness/asset-side-effects.ts';
import { resolvedRuntimeSourceFile } from './runtime-source-file.ts';
import type { ConstantValue } from './constant-value.ts';

export type ConstantModuleGuardDependencies = {
    readonly constantValue: (
        expression: Expression,
        context: ConstantContext
    ) => ConstantValue | undefined;
};

type ModuleGuardContext = {
    readonly context: ConstantContext;
    readonly dependencies: ConstantModuleGuardDependencies;
    readonly moduleHasSideEffects: (sourceFile: SourceFile) => boolean;
};

function moduleSpecifierIsRelative(moduleSpecifier: string): boolean {
    return moduleSpecifier.startsWith('.');
}

function staticModuleStatement(statement: Statement): boolean {
    return TsMorphNode.isExportDeclaration(statement) ||
        TsMorphNode.isFunctionDeclaration(statement) ||
        TsMorphNode.isInterfaceDeclaration(statement) ||
        TsMorphNode.isTypeAliasDeclaration(statement);
}

function variableStatementBlocksNpmConstant(statement: Statement, guard: ModuleGuardContext): boolean {
    if (!TsMorphNode.isVariableStatement(statement)) {
        return true;
    }
    return statement.getDeclarations().some(function (declaration) {
        const initializer = declaration.getInitializer();
        return initializer !== undefined && guard.dependencies.constantValue(initializer, guard.context) === undefined;
    });
}

function statementBlocksNpmConstant(statement: Statement, guard: ModuleGuardContext): boolean {
    if (TsMorphNode.isImportDeclaration(statement)) {
        return sideEffectAssetImportKind(statement.getModuleSpecifierValue()) !== undefined;
    }
    if (TsMorphNode.isVariableStatement(statement)) {
        return variableStatementBlocksNpmConstant(statement, guard);
    }
    return !staticModuleStatement(statement);
}

function relativeImportHasSideEffects(declaration: ImportDeclaration, guard: ModuleGuardContext): boolean {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    if (!moduleSpecifierIsRelative(moduleSpecifier)) {
        return false;
    }
    const target = resolvedRuntimeSourceFile(moduleSpecifier, declaration.getSourceFile());
    return target === undefined || guard.moduleHasSideEffects(target);
}

function relativeImportsHaveSideEffects(sourceFile: SourceFile, guard: ModuleGuardContext): boolean {
    return sourceFile.getImportDeclarations().some(function (declaration) {
        return relativeImportHasSideEffects(declaration, guard);
    });
}

export function moduleGraphHasSideEffects(
    sourceFile: SourceFile,
    context: ConstantContext,
    dependencies: ConstantModuleGuardDependencies
): boolean {
    const nextContext = childModuleGuardContext(context, sourceFile.getFilePath());
    if (nextContext === undefined) {
        return true;
    }
    const guard = {
        context: nextContext,
        dependencies,
        moduleHasSideEffects(target: SourceFile) {
            return moduleGraphHasSideEffects(target, nextContext, dependencies);
        }
    };
    return sourceFile.getStatements().some(function (statement) {
        return statementBlocksNpmConstant(statement, guard);
    }) || relativeImportsHaveSideEffects(sourceFile, guard);
}
