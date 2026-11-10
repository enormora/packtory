import {
    Node as TypeScriptMorphNode,
    type ExportAssignment,
    type Expression,
    type SourceFile,
    type VariableDeclaration,
    type Node as TypeScriptMorphNodeType
} from 'ts-morph';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import { resolveImportedExpressionPropertyPath } from '../imported-expression-origin.ts';
import { constantStatement } from './constant-binding.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { moduleDependenciesInitialize, moduleInitializesBinding } from './module-initialization.ts';
import type { EvaluatedValue } from './primitive-value.ts';

type ConstantExport = ExportAssignment | VariableDeclaration;
export type ConstantBinding = {
    readonly declaration: ConstantExport;
    readonly expression: Expression;
};

function exportedConstantBinding(
    declaration: TypeScriptMorphNodeType | undefined,
    sourceFile: SourceFile
): VariableDeclaration | undefined {
    if (
        !TypeScriptMorphNode.isVariableDeclaration(declaration) ||
        constantStatement(declaration)?.getParent() !== sourceFile
    ) {
        return undefined;
    }
    return declaration;
}

function constantExportAssignment(declaration: ExportAssignment): ConstantBinding | undefined {
    return !declaration.isExportEquals() && TypeScriptMorphNode.isSourceFile(declaration.getParent())
        ? { declaration, expression: declaration.getExpression() }
        : undefined;
}

export function constantBinding(declaration: TypeScriptMorphNodeType): ConstantBinding | undefined {
    if (TypeScriptMorphNode.isExportAssignment(declaration)) {
        return constantExportAssignment(declaration);
    }
    const binding = exportedConstantBinding(declaration, declaration.getSourceFile());
    if (binding === undefined) {
        return undefined;
    }
    const expression = binding.getInitializer();
    return expression === undefined ? undefined : { declaration: binding, expression };
}

function ownConstantExport(sourceFile: SourceFile, name: string): ConstantExport | undefined {
    const symbol = sourceFile.getExportSymbols().find(function (exported) {
        return exported.getName() === name;
    });
    const declaration = (symbol?.getAliasedSymbol() ?? symbol)?.getValueDeclaration();
    return exportedConstantBinding(declaration, sourceFile);
}

function constantExport(sourceFile: SourceFile, name: string): ConstantExport | undefined {
    if (name === 'default') {
        const [ assignment, additional ] = sourceFile.getExportAssignments();
        if (assignment !== undefined) {
            return additional === undefined ? assignment : undefined;
        }
    }
    return ownConstantExport(sourceFile, name);
}

function importedConstantExport(
    expression: Expression,
    resolveModule: RuntimeModuleResolver
): ConstantExport | undefined {
    const origin = resolveImportedExpressionPropertyPath(expression);
    if (origin === undefined) {
        return undefined;
    }
    const name = origin.path.length === 1 ? origin.path[0] : undefined;
    if (typeof name !== 'string') {
        return undefined;
    }
    const sourceFile = resolveModule(origin.from, expression.getSourceFile());
    return sourceFile === undefined ? undefined : constantExport(sourceFile, name);
}

export function evaluateImportedConstant(
    expression: Expression,
    resolveModule: RuntimeModuleResolver
): EvaluatedValue | undefined {
    const exported = importedConstantExport(expression, resolveModule);
    if (exported === undefined) {
        return undefined;
    }
    const binding = constantBinding(exported);
    if (binding === undefined || !moduleInitializesBinding(binding.declaration, resolveModule)) {
        return undefined;
    }
    if (
        expression.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration) !== undefined &&
        !moduleDependenciesInitialize(expression.getSourceFile(), resolveModule)
    ) {
        return undefined;
    }
    return createSourceEvaluation(binding.expression.getSourceFile()).primitiveValue(binding.expression);
}
