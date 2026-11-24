import type { CallExpression, NewExpression } from 'ts-morph';
import { isPrimitiveResult } from './abstract-value.ts';
import { createRuntimeBoundedEvaluator } from './runtime-evaluation.ts';

export type EvaluatedOutcome = 'coercion-safe-primitive' | 'value';

export function evaluatedOutcomeOf(expression: CallExpression | NewExpression): EvaluatedOutcome | undefined {
    const value = createRuntimeBoundedEvaluator(expression.getSourceFile(), new Map())(expression);
    if (value === undefined) {
        return undefined;
    }
    return isPrimitiveResult(value) && typeof value.value !== 'bigint' ? 'coercion-safe-primitive' : 'value';
}
