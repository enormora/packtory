import type { Expression, SourceFile } from 'ts-morph';
import { isPrimitiveResult } from './abstract-value.ts';
import { createRuntimeSourceEvaluation, type SourceEvaluation } from './constant-evaluation.ts';

type EvaluatedOutcome = 'coercion-safe-primitive' | 'value';

export type EvaluatedOutcomes = (expression: Expression) => EvaluatedOutcome | undefined;

export function createEvaluatedOutcomes(): EvaluatedOutcomes {
    const evaluations = new WeakMap<SourceFile, SourceEvaluation>();
    return function (expression) {
        const source = expression.getSourceFile();
        const evaluation = evaluations.get(source) ?? createRuntimeSourceEvaluation(source);
        evaluations.set(source, evaluation);
        const value = evaluation.knownValue(expression);
        if (value === undefined) {
            return undefined;
        }
        return isPrimitiveResult(value) && typeof value.value !== 'bigint' ? 'coercion-safe-primitive' : 'value';
    };
}
