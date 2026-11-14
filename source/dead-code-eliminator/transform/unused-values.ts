import {
    Node as TypeScriptMorphNode,
    VariableDeclarationKind,
    type Expression,
    type ExpressionStatement,
    type ClassDeclaration,
    type Node as TypeScriptMorphNodeType,
    type SourceFile,
    type Statement,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import { applySourcePreparation, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { createUnusedValueResolver, type UnusedValueResolver } from '../evaluation/unused-value-effects.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import type { ExpressionPurityChecker } from '../imported-expression-origin.ts';
import { bindingHasOnlyUses } from '../binding-stability.ts';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { sourceReplacement, type SourcePart } from './source-replacement.ts';

function discardedValueSource(
    expression: Expression,
    resolveUnused: UnusedValueResolver
): readonly SourcePart[] | undefined {
    const retained = resolveUnused(expression);
    if (retained === undefined) {
        return undefined;
    }
    return retained.length === 0 ? [ ';' ] : retained.flatMap(function (argument): readonly SourcePart[] {
        return TypeScriptMorphNode.isExpression(argument)
            ? [ '(', argument, ');' ]
            : [ '({', argument, '});' ];
    });
}

function residualInitializer(
    initializer: Expression,
    resolveUnused: UnusedValueResolver,
    isPure: ExpressionPurityChecker
): readonly SourcePart[] | undefined {
    const residual = discardedValueSource(initializer, resolveUnused);
    if (residual !== undefined) {
        return residual;
    }
    if (TypeScriptMorphNode.isClassExpression(unwrapExpression(initializer)) || isPure(initializer)) {
        return undefined;
    }
    return [ '(', initializer, ');' ];
}

function residualDeclaration(
    declaration: VariableDeclaration,
    resolveUnused: UnusedValueResolver,
    isPure: ExpressionPurityChecker
): readonly SourcePart[] | undefined {
    if (!bindingHasOnlyUses(declaration.getNameNode(), declaration, new Set())) {
        return undefined;
    }
    const initializer = declaration.getInitializer();
    return initializer === undefined ? [ ';' ] : residualInitializer(initializer, resolveUnused, isPure);
}

function replaceStatement(statement: Statement, parts: readonly SourcePart[]): readonly SourceTextEdit[] {
    return sourceReplacement(
        statement,
        TypeScriptMorphNode.isStatemented(statement.getParent())
            ? parts
            : [ '{ ', ...parts, ' }' ]
    );
}

function variableStatementEdits(
    statement: VariableStatement,
    resolveUnused: UnusedValueResolver,
    isPure: ExpressionPurityChecker
): readonly SourceTextEdit[] {
    const kind = statement.getDeclarationKind();
    if (
        statement.isExported() || statement.isAmbient() ||
        ![ VariableDeclarationKind.Const, VariableDeclarationKind.Let, VariableDeclarationKind.Var ].includes(kind)
    ) {
        return [];
    }
    const residuals = statement.getDeclarations().map(function (declaration) {
        return { declaration, residual: residualDeclaration(declaration, resolveUnused, isPure) };
    });
    if (
        residuals.every(function ({ residual }) {
            return residual === undefined;
        })
    ) {
        return [];
    }
    const parts = residuals.flatMap(function ({ declaration, residual }): readonly SourcePart[] {
        return residual ?? [ `${kind} `, declaration, ';' ];
    });
    return replaceStatement(statement, parts);
}

function expressionStatementEdits(
    statement: ExpressionStatement,
    resolveUnused: UnusedValueResolver
): readonly SourceTextEdit[] {
    const expression = statement.getExpression();
    if (TypeScriptMorphNode.isStringLiteral(expression)) {
        return [];
    }
    const residual = discardedValueSource(expression, resolveUnused);
    return residual === undefined ? [] : replaceStatement(statement, residual);
}

function classStatementEdits(
    statement: ClassDeclaration,
    resolveUnused: UnusedValueResolver
): readonly SourceTextEdit[] {
    if (statement.isExported() || statement.isAmbient()) {
        return [];
    }
    if (!bindingHasOnlyUses(statement.getNameNodeOrThrow(), statement, new Set())) {
        return [];
    }
    return resolveUnused(statement) === undefined ? [] : replaceStatement(statement, [ ';' ]);
}

function unusedStatementEdits(
    node: TypeScriptMorphNodeType,
    resolveUnused: UnusedValueResolver,
    isPure: ExpressionPurityChecker
): readonly SourceTextEdit[] {
    if (TypeScriptMorphNode.isVariableStatement(node)) {
        return variableStatementEdits(node, resolveUnused, isPure);
    }
    if (TypeScriptMorphNode.isClassDeclaration(node)) {
        return classStatementEdits(node, resolveUnused);
    }
    return TypeScriptMorphNode.isExpressionStatement(node) ? expressionStatementEdits(node, resolveUnused) : [];
}

function unusedValueEdits(sourceFile: SourceFile, isPure: ExpressionPurityChecker): readonly SourceTextEdit[] {
    const resolveUnused = createUnusedValueResolver(sourceFile, isPure);
    const changes: SourceTextEdit[] = [];
    sourceFile.forEachDescendant(function (node, traversal) {
        const edits = unusedStatementEdits(node, resolveUnused, isPure);
        if (edits.length === 0) {
            return;
        }
        changes.push(...edits);
        traversal.skip();
    });
    return changes;
}

export function removeUnusedValues(preparation: SourcePreparation, isPure: ExpressionPurityChecker): void {
    const { sourceFile } = preparation;
    if (hasDynamicScope(sourceFile) || !runtimeSourceIsValid(sourceFile)) {
        return;
    }
    applySourcePreparation(preparation, function (source) {
        return unusedValueEdits(source, isPure);
    });
}
