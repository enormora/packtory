import type { Expression, SourceFile } from 'ts-morph';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { createBoundedEvaluator, createConstantEvaluator } from './local-call.ts';
import type { KnownConstants } from './constant-binding.ts';
import type { EvaluatedValue } from './primitive-value.ts';

function runtimeEvaluation<Value>(
    sourceFile: SourceFile,
    evaluate: (expression: Expression) => Value | undefined
): (expression: Expression) => Value | undefined {
    const sourceIsValid = runtimeSourceIsValid(sourceFile);
    return function (expression) {
        return sourceIsValid ? evaluate(expression) : undefined;
    };
}

export function createRuntimeBoundedEvaluator(
    sourceFile: SourceFile,
    values: KnownConstants
): ReturnType<typeof createBoundedEvaluator> {
    return runtimeEvaluation(sourceFile, createBoundedEvaluator(sourceFile, values));
}

export function createRuntimeConstantEvaluator(
    sourceFile: SourceFile,
    values: KnownConstants
): (expression: Expression) => EvaluatedValue | undefined {
    return runtimeEvaluation(sourceFile, createConstantEvaluator(sourceFile, values));
}
