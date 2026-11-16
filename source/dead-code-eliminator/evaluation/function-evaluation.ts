import { hasDynamicScope } from '../dynamic-scope.ts';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { intrinsicUndefined } from './constant-binding.ts';
import {
    createCallEvaluator,
    evaluateFunctionBody,
    evaluateFunctionCall,
    functionIsSynchronous
} from './callee-evaluation.ts';
import type { LocalFunction } from './call-target.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { createEvaluationContext } from './local-call.ts';
import { initializeHoistedLocals } from './hoisted-locals.ts';
import { primitiveResult } from './abstract-value.ts';
import type { EvaluatedValue } from './primitive-value.ts';

function functionContext(
    target: LocalFunction,
    readConstant: EvaluationContext['readConstant']
): EvaluationContext | undefined {
    const source = target.getSourceFile();
    if (!runtimeSourceIsValid(source) || hasDynamicScope(source)) {
        return undefined;
    }
    return createEvaluationContext(createCallEvaluator(source)(), readConstant);
}

export function evaluateLocalFunction(target: LocalFunction): EvaluatedValue | undefined {
    const context = functionContext(target, function (identifier) {
        return intrinsicUndefined(identifier) ? { value: undefined } : undefined;
    });
    return context !== undefined && initializeHoistedLocals(target, context)
        ? primitiveResult(evaluateFunctionBody(target, context))
        : undefined;
}

export function evaluateLocalFunctionCall(
    target: LocalFunction,
    values: readonly EvaluatedValue[],
    readConstant: EvaluationContext['readConstant']
): EvaluatedValue | undefined {
    const context = functionIsSynchronous(target) ? functionContext(target, readConstant) : undefined;
    return context === undefined ? undefined : primitiveResult(evaluateFunctionCall(target, values, context));
}
