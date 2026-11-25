import type { CallExpression } from 'ts-morph';
import { isPrimitiveResult, type AbstractValue } from './abstract-value.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { globalPathOf } from './global-path.ts';
import { intrinsicIntegrityOf } from './evaluation-environment.ts';
import { evaluateComputedKey } from './property-key-evaluation.ts';

type IntrinsicCall = (argumentValues: readonly AbstractValue[]) => AbstractValue | undefined;

function createSymbol(argumentValues: readonly AbstractValue[]): AbstractValue | undefined {
    const [ description ] = argumentValues;
    return description === undefined || isPrimitiveResult(description)
        ? { value: Symbol('evaluated symbol') }
        : undefined;
}

const intrinsicCalls: ReadonlyMap<string, IntrinsicCall> = new Map([
    [ 'Symbol', createSymbol ]
]);

export function evaluateIntrinsicCall(
    call: CallExpression,
    argumentValues: readonly AbstractValue[],
    context: EvaluationContext
): AbstractValue | undefined {
    const calleePath = globalPathOf(call.getExpression(), function (key) {
        return evaluateComputedKey(key, context);
    });
    if (calleePath === undefined) {
        return undefined;
    }
    const intrinsic = intrinsicCalls.get(calleePath.join('.'));
    return intrinsic !== undefined && intrinsicIntegrityOf(call.getSourceFile()).isIntact(calleePath)
        ? intrinsic(argumentValues)
        : undefined;
}
