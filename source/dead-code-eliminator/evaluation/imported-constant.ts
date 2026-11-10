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

type ConstantExport = {
    readonly expression: Expression;
    readonly initialization: ExportAssignment | VariableDeclaration;
};

function exportedConstantBinding(
    declaration: TypeScriptMorphNodeType | undefined,
    sourceFile: SourceFile
): ConstantExport | undefined {
    if (
        !TypeScriptMorphNode.isVariableDeclaration(declaration) || declaration.getSourceFile() !== sourceFile ||
        constantStatement(declaration)?.getParent() !== sourceFile
    ) {
        return undefined;
    }
    const expression = declaration.getInitializer();
    return expression === undefined ? undefined : { expression, initialization: declaration };
}

export function constantBindingExpression(declaration: TypeScriptMorphNodeType): Expression | undefined {
    if (TypeScriptMorphNode.isExportAssignment(declaration)) {
        return !declaration.isExportEquals() && TypeScriptMorphNode.isSourceFile(declaration.getParent())
            ? declaration.getExpression()
            : undefined;
    }
    return exportedConstantBinding(declaration, declaration.getSourceFile())?.expression;
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
        const assignments = sourceFile.getExportAssignments().filter(function (assignment) {
            return !assignment.isExportEquals();
        });
        if (assignments.length > 0) {
            const [ assignment ] = assignments;
            return assignment !== undefined && assignments.length === 1
                ? { expression: assignment.getExpression(), initialization: assignment }
                : undefined;
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
    if (exported === undefined || !moduleInitializesBinding(exported.initialization, resolveModule)) {
        return undefined;
    }
    if (
        expression.getFirstAncestor(TypeScriptMorphNode.isFunctionLikeDeclaration) !== undefined &&
        !moduleDependenciesInitialize(expression.getSourceFile(), resolveModule)
    ) {
        return undefined;
    }
    return createSourceEvaluation(exported.expression.getSourceFile()).primitiveValue(exported.expression);
}
