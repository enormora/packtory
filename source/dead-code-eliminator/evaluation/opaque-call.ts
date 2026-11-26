import type { CallExpression } from 'ts-morph';
import { hasPureCallAnnotation } from '../call-annotation.ts';
import { opaqueResult, type AbstractValue } from './abstract-value.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { importedCallValue } from './imported-value.ts';
import { evaluateIntrinsicCall } from './intrinsic-call.ts';

export function annotatedCallValue(call: CallExpression): AbstractValue | undefined {
    return hasPureCallAnnotation(call) ? opaqueResult('value') : undefined;
}

export function nonLocalCallValue(
    call: CallExpression,
    argumentValues: readonly AbstractValue[],
    context: EvaluationContext
): AbstractValue | undefined {
    return evaluateIntrinsicCall(call, argumentValues, context) ?? annotatedCallValue(call) ??
        importedCallValue(call, context);
}

export function evaluateCallWithoutLocalTargets(
    call: CallExpression,
    context: EvaluationContext
): AbstractValue | undefined {
    const argumentValues: AbstractValue[] = [];
    for (const argument of call.getArguments()) {
        const value = context.evaluate(argument, context);
        if (value === undefined) {
            return undefined;
        }
        argumentValues.push(value);
    }
    return nonLocalCallValue(call, argumentValues, context);
}
