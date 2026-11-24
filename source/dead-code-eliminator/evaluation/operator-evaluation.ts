import { isTruthy } from 'remeda';
import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type BinaryExpression,
    type ConditionalExpression,
    type PostfixUnaryExpression,
    type PrefixUnaryExpression,
    type TypeOfExpression,
    type VoidExpression
} from 'ts-morph';
import type { EvaluationContext } from './evaluation-context.ts';
import { evaluated, shortCircuitValue, type EvaluatedValue } from './primitive-value.ts';
import {
    evaluateAbstractBinary,
    evaluateAbstractUnary,
    typeOfResult,
    type AbstractValue
} from './abstract-value.ts';
import { evaluateAssignment, evaluateUpdate } from './assignment-evaluation.ts';

export function evaluateUnary(
    expression: PostfixUnaryExpression | PrefixUnaryExpression,
    context: EvaluationContext
): AbstractValue | undefined {
    const operator = expression.getOperatorToken();
    if (operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken) {
        return evaluateUpdate(expression, context);
    }
    const operand = context.evaluate(expression.getOperand(), context);
    return operand === undefined ? undefined : evaluateAbstractUnary(operator, operand);
}

function binaryOperandsValue(expression: BinaryExpression, context: EvaluationContext): AbstractValue | undefined {
    const left = context.evaluate(expression.getLeft(), context);
    if (left === undefined) {
        return undefined;
    }
    const shortCircuit = shortCircuitValue(expression.getOperatorToken().getKind(), left.value);
    if (shortCircuit === true) {
        return left;
    }
    const right = context.evaluate(expression.getRight(), context);
    if (shortCircuit === false || right === undefined) {
        return right;
    }
    return evaluateAbstractBinary(expression.getOperatorToken().getKind(), left, right);
}

export function evaluateBinary(expression: BinaryExpression, context: EvaluationContext): AbstractValue | undefined {
    const operator = expression.getOperatorToken().getKind();
    return operator >= SyntaxKind.FirstAssignment && operator <= SyntaxKind.LastAssignment
        ? evaluateAssignment(expression, context)
        : binaryOperandsValue(expression, context);
}

export function evaluateConditional(
    expression: ConditionalExpression,
    context: EvaluationContext
): AbstractValue | undefined {
    const condition = context.evaluate(expression.getCondition(), context);
    if (condition === undefined) {
        return undefined;
    }
    return context.evaluate(isTruthy(condition.value) ? expression.getWhenTrue() : expression.getWhenFalse(), context);
}

export function evaluateKeywordUnary(
    expression: TypeOfExpression | VoidExpression,
    context: EvaluationContext
): EvaluatedValue | undefined {
    const operand = context.evaluate(expression.getExpression(), context);
    if (operand === undefined) {
        return undefined;
    }
    return evaluated(TypeScriptMorphNode.isTypeOfExpression(expression) ? typeOfResult(operand) : undefined);
}
