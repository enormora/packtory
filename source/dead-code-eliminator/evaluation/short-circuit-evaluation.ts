import type { BinaryExpression } from 'ts-morph';
import { eitherResult, shortCircuitSelection, type AbstractValue } from './abstract-value.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { evaluateIntrinsicCallSite } from './intrinsic-call.ts';
import { expressionIsWriteFree } from './write-free-expression.ts';

function speculativeRightValue(
    expression: BinaryExpression,
    left: AbstractValue,
    context: EvaluationContext
): AbstractValue | undefined {
    const right = expression.getRight();
    if (!expressionIsWriteFree(right)) {
        return undefined;
    }
    const speculative = { ...context, call: evaluateIntrinsicCallSite };
    const value = speculative.evaluate(right, speculative);
    return value === undefined ? undefined : eitherResult(left, value);
}

export function evaluateLogicalOperands(
    expression: BinaryExpression,
    left: AbstractValue,
    context: EvaluationContext
): AbstractValue | 'not-logical' | undefined {
    const selection = shortCircuitSelection(expression.getOperatorToken().getKind(), left);
    if (selection === undefined) {
        return 'not-logical';
    }
    if (selection === 'left') {
        return left;
    }
    return selection === 'right'
        ? context.evaluate(expression.getRight(), context)
        : speculativeRightValue(expression, left, context);
}
