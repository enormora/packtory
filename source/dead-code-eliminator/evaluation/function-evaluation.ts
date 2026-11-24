import type { SourceFile } from 'ts-morph';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { intrinsicUndefined } from './global-reference.ts';
import {
    createCallEvaluator,
    evaluateFunctionBody,
    evaluateFunctionCall,
    functionIsSynchronous
} from './callee-evaluation.ts';
import type { LocalFunction } from './call-target.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { createEvaluationContext } from './local-call.ts';
import { primitiveResult } from './abstract-value.ts';
import type { EvaluatedValue } from './primitive-value.ts';

export type FunctionEvaluation = {
    readonly bodyValue: (target: LocalFunction) => EvaluatedValue | undefined;
    readonly callValue: (
        target: LocalFunction,
        values: readonly EvaluatedValue[],
        readConstant: EvaluationContext['readConstant']
    ) => EvaluatedValue | undefined;
};

function createFunctionContext(source: SourceFile): (
    readConstant: EvaluationContext['readConstant']
) => EvaluationContext | undefined {
    let sourceIsSafe: boolean | null = null;
    let evaluateCall: ReturnType<typeof createCallEvaluator> | null = null;
    return function (readConstant) {
        sourceIsSafe = sourceIsSafe ?? (runtimeSourceIsValid(source) && !hasDynamicScope(source));
        if (!sourceIsSafe) {
            return undefined;
        }
        evaluateCall = evaluateCall ?? createCallEvaluator(source);
        return createEvaluationContext(evaluateCall(), readConstant);
    };
}

export function createFunctionEvaluation(source: SourceFile): FunctionEvaluation {
    const contextFor = createFunctionContext(source);
    return {
        bodyValue(target) {
            const context = contextFor(function (identifier) {
                return intrinsicUndefined(identifier) ? { value: undefined } : undefined;
            });
            return context === undefined
                ? undefined
                : primitiveResult(evaluateFunctionBody(target, context));
        },
        callValue(target, values, readConstant) {
            const context = functionIsSynchronous(target) ? contextFor(readConstant) : undefined;
            return context === undefined ? undefined : primitiveResult(evaluateFunctionCall(target, values, context));
        }
    };
}
