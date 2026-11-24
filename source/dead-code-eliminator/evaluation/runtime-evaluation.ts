import type { Node as TypeScriptMorphNode, SourceFile } from 'ts-morph';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { createBoundedEvaluator } from './local-call.ts';
import type { KnownConstants } from './constant-binding.ts';

function runtimeEvaluation<Value, Input extends TypeScriptMorphNode>(
    sourceFile: SourceFile,
    evaluate: (expression: Input) => Value | undefined
): (expression: Input) => Value | undefined {
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
