import { isTruthy } from 'remeda';
import {
    Node as TypeScriptMorphNode,
    VariableDeclarationKind,
    type BinaryExpression,
    type ConditionalExpression,
    type Expression,
    type ExpressionStatement,
    type IfStatement,
    type Node as TypeScriptMorphNodeType,
    type SourceFile,
    type Statement
} from 'ts-morph';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import { applySourcePreparation, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { createSourceEvaluation } from '../evaluation/constant-evaluation.ts';
import { shortCircuitValue, type EvaluatedValue } from '../evaluation/primitive-value.ts';
import { shortCircuitOperators } from '../syntax-kind-sets.ts';
import { sourceReplacement, type SourcePart } from './source-replacement.ts';
import { primitiveSource } from './primitive-source.ts';

type PrimitiveEvaluator = (expression: Expression) => EvaluatedValue | undefined;

function declarationIsHoisted(node: TypeScriptMorphNodeType): boolean {
    if (TypeScriptMorphNode.isVariableDeclarationList(node)) {
        return node.getDeclarationKind() === VariableDeclarationKind.Var;
    }
    return TypeScriptMorphNode.isFunctionDeclaration(node);
}

function hasHoistedDeclarations(statement: Statement | undefined): boolean {
    if (statement === undefined) {
        return false;
    }
    return [ statement, ...statement.getDescendants() ].some(declarationIsHoisted);
}

function selectedValueSource(expression: Expression, evaluate: PrimitiveEvaluator): readonly SourcePart[] {
    const value = evaluate(expression);
    const literal = value === undefined ? undefined : primitiveSource(value);
    return literal !== undefined && literal.length <= expression.getWidth()
        ? [ `(${literal})` ]
        : [ '(0, ', expression, ')' ];
}

function selectedStatementSource(selected: Statement | undefined): readonly SourcePart[] {
    if (selected === undefined) {
        return [ ';' ];
    }
    return TypeScriptMorphNode.isBlock(selected) ? [ selected ] : [ '{ ', selected, ' }' ];
}

function constantBranchSource(statement: IfStatement, evaluate: PrimitiveEvaluator): readonly SourcePart[] | undefined {
    const condition = evaluate(statement.getExpression());
    if (
        condition === undefined ||
        [ statement.getThenStatement(), statement.getElseStatement() ].some(hasHoistedDeclarations)
    ) {
        return undefined;
    }
    return selectedStatementSource(
        isTruthy(condition.value) ? statement.getThenStatement() : statement.getElseStatement()
    );
}

function conditionalSource(
    expression: ConditionalExpression,
    evaluate: PrimitiveEvaluator
): readonly SourcePart[] | undefined {
    const condition = evaluate(expression.getCondition());
    if (condition === undefined) {
        return undefined;
    }
    return selectedValueSource(
        isTruthy(condition.value) ? expression.getWhenTrue() : expression.getWhenFalse(),
        evaluate
    );
}

function shortCircuitSource(
    expression: BinaryExpression,
    evaluate: PrimitiveEvaluator
): readonly SourcePart[] | undefined {
    const operator = expression.getOperatorToken().getKind();
    if (!shortCircuitOperators.has(operator)) {
        return undefined;
    }
    const left = evaluate(expression.getLeft());
    if (left === undefined) {
        return undefined;
    }
    const selected = shortCircuitValue(operator, left.value) === true
        ? expression.getLeft()
        : expression.getRight();
    return selectedValueSource(selected, evaluate);
}

function pureStatementSource(
    statement: ExpressionStatement,
    evaluate: PrimitiveEvaluator
): readonly SourcePart[] | undefined {
    const expression = statement.getExpression();
    if (TypeScriptMorphNode.isStringLiteral(expression)) {
        return undefined;
    }
    return evaluate(expression) === undefined ? undefined : [ ';' ];
}

function replacementSource(
    node: TypeScriptMorphNodeType,
    evaluate: PrimitiveEvaluator
): readonly SourcePart[] | undefined {
    if (TypeScriptMorphNode.isIfStatement(node)) {
        return constantBranchSource(node, evaluate);
    }
    if (TypeScriptMorphNode.isConditionalExpression(node)) {
        return conditionalSource(node, evaluate);
    }
    if (TypeScriptMorphNode.isBinaryExpression(node)) {
        return shortCircuitSource(node, evaluate);
    }
    if (TypeScriptMorphNode.isExpressionStatement(node)) {
        return pureStatementSource(node, evaluate);
    }
    return undefined;
}

function controlFlowEdits(sourceFile: SourceFile): readonly SourceTextEdit[] {
    const evaluate = createSourceEvaluation(sourceFile).primitiveValue;
    const edits: SourceTextEdit[] = [];
    sourceFile.forEachDescendant(function (node, traversal) {
        const content = replacementSource(node, evaluate);
        if (content === undefined) {
            return;
        }
        edits.push(...sourceReplacement(node, content));
        traversal.skip();
    });
    return edits;
}

export function simplifyConstantControlFlow(preparation: SourcePreparation): void {
    const { sourceFile } = preparation;
    if (hasDynamicScope(sourceFile)) {
        return;
    }
    applySourcePreparation(preparation, controlFlowEdits);
}
