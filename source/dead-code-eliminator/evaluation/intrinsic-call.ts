import type { CallExpression } from 'ts-morph';
import { isPrimitiveResult, type AbstractValue } from './abstract-value.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { globalPathOf } from './global-path.ts';
import { intrinsicIntegrityOf } from './evaluation-environment.ts';
import { evaluateComputedKey } from './property-key-evaluation.ts';

type IntrinsicCall = (argumentValues: readonly AbstractValue[]) => AbstractValue | undefined;

function createSymbol(argumentValues: readonly AbstractValue[]): AbstractValue | undefined {
    const [ description ] = argumentValues;
    if (description !== undefined && !isPrimitiveResult(description)) {
        return undefined;
    }
    return { value: Symbol(description === undefined ? undefined : String(description.value)) };
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
    const intrinsic = calleePath === undefined ? undefined : intrinsicCalls.get(calleePath.join('.'));
    if (calleePath === undefined || intrinsic === undefined) {
        return undefined;
    }
    return intrinsicIntegrityOf(call.getSourceFile()).isIntact(calleePath) ? intrinsic(argumentValues) : undefined;
}
