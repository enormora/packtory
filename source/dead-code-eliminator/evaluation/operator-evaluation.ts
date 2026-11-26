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
import { isAssignmentOperator } from '../assignment-operator.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { evaluated } from './primitive-value.ts';
import {
    evaluateAbstractBinary,
    evaluateAbstractUnary,
    opaqueResult,
    truthinessOf,
    typeOfResult,
    type AbstractValue
} from './abstract-value.ts';
import { evaluateAssignment, evaluateUpdate } from './assignment-evaluation.ts';
import { evaluateLogicalOperands } from './short-circuit-evaluation.ts';

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
    const logical = evaluateLogicalOperands(expression, left, context);
    if (logical !== 'not-logical') {
        return logical;
    }
    const right = context.evaluate(expression.getRight(), context);
    return right === undefined
        ? undefined
        : evaluateAbstractBinary(expression.getOperatorToken().getKind(), left, right);
}

export function evaluateBinary(expression: BinaryExpression, context: EvaluationContext): AbstractValue | undefined {
    const operator = expression.getOperatorToken().getKind();
    return isAssignmentOperator(operator)
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
    const truthy = truthinessOf(condition);
    if (truthy === undefined) {
        return undefined;
    }
    return context.evaluate(truthy ? expression.getWhenTrue() : expression.getWhenFalse(), context);
}

export function evaluateKeywordUnary(
    expression: TypeOfExpression | VoidExpression,
    context: EvaluationContext
): AbstractValue | undefined {
    const operand = context.evaluate(expression.getExpression(), context);
    if (operand === undefined) {
        return undefined;
    }
    if (!TypeScriptMorphNode.isTypeOfExpression(expression)) {
        return evaluated(undefined);
    }
    const type = typeOfResult(operand);
    return type === undefined ? opaqueResult('primitive') : evaluated(type);
}
