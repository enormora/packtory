import { Node as TypeScriptMorphNode, SyntaxKind, type BinaryExpression, type Expression } from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { shortCircuitOperators } from '../syntax-kind-sets.ts';
import type { SourceEvaluation } from './constant-evaluation.ts';
import { maximumEvaluationDepth } from './evaluation-context.ts';

export type ConditionOutcome = {
    readonly truthy: boolean | undefined;
    readonly nullish: boolean | undefined;
};
const unknownOutcome: ConditionOutcome = { truthy: undefined, nullish: undefined };

type ShortCircuitKind = SyntaxKind.AmpersandAmpersandToken | SyntaxKind.BarBarToken | SyntaxKind.QuestionQuestionToken;

export function isShortCircuitOperator(operator: SyntaxKind): operator is ShortCircuitKind {
    return shortCircuitOperators.has(operator);
}

export function selectsLeft(operator: ShortCircuitKind, outcome: ConditionOutcome): boolean | undefined {
    if (operator === SyntaxKind.AmpersandAmpersandToken) {
        return outcome.truthy === undefined ? undefined : !outcome.truthy;
    }
    if (operator === SyntaxKind.BarBarToken) {
        return outcome.truthy;
    }
    return outcome.nullish === undefined ? undefined : !outcome.nullish;
}

function logicalOutcome(operator: ShortCircuitKind, right: ConditionOutcome): ConditionOutcome {
    if (operator === SyntaxKind.AmpersandAmpersandToken && right.truthy === false) {
        return { truthy: false, nullish: undefined };
    }
    return operator === SyntaxKind.BarBarToken && right.truthy === true
        ? { truthy: true, nullish: false }
        : unknownOutcome;
}

function shortCircuitOutcome(
    node: BinaryExpression,
    operator: ShortCircuitKind,
    outcomeOf: (expression: Expression) => ConditionOutcome
): ConditionOutcome {
    const left = outcomeOf(node.getLeft());
    const selected = selectsLeft(operator, left);
    if (selected === true) {
        return left;
    }
    const right = outcomeOf(node.getRight());
    return selected === false ? right : logicalOutcome(operator, right);
}

function binaryOutcome(
    node: BinaryExpression,
    outcomeOf: (expression: Expression) => ConditionOutcome
): ConditionOutcome {
    const operator = node.getOperatorToken().getKind();
    if (operator === SyntaxKind.CommaToken) {
        return outcomeOf(node.getRight());
    }
    return isShortCircuitOperator(operator) ? shortCircuitOutcome(node, operator, outcomeOf) : unknownOutcome;
}

function creationOutcome(node: Expression): ConditionOutcome {
    const truthyKinds = new Set([
        SyntaxKind.ObjectLiteralExpression,
        SyntaxKind.ArrayLiteralExpression,
        SyntaxKind.FunctionExpression,
        SyntaxKind.ArrowFunction,
        SyntaxKind.TypeOfExpression
    ]);
    const ordinaryClass = TypeScriptMorphNode.isClassExpression(node) && node.getDecorators().length === 0;
    return ordinaryClass || truthyKinds.has(node.getKind()) ? { truthy: true, nullish: false } : unknownOutcome;
}

function syntaxOutcome(
    node: Expression,
    outcomeOf: (expression: Expression) => ConditionOutcome
): ConditionOutcome {
    if (TypeScriptMorphNode.isVoidExpression(node)) {
        return { truthy: false, nullish: true };
    }
    if (TypeScriptMorphNode.isPrefixUnaryExpression(node) && node.getOperatorToken() === SyntaxKind.ExclamationToken) {
        const operand = outcomeOf(node.getOperand());
        return { truthy: operand.truthy === undefined ? undefined : !operand.truthy, nullish: false };
    }
    return TypeScriptMorphNode.isBinaryExpression(node) ? binaryOutcome(node, outcomeOf) : creationOutcome(node);
}

export function conditionOutcome(
    expression: Expression,
    evaluation: SourceEvaluation,
    depth: number
): ConditionOutcome {
    if (depth >= maximumEvaluationDepth) {
        return unknownOutcome;
    }
    const value = evaluation.knownValue(expression);
    if (value !== undefined) {
        return { truthy: Boolean(value.value), nullish: value.value === null || value.value === undefined };
    }
    return syntaxOutcome(unwrapExpression(expression), function (operand) {
        return conditionOutcome(operand, evaluation, depth + 1);
    });
}
