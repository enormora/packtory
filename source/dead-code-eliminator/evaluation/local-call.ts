import type { CallExpression, Expression, Node as TypeScriptMorphNode, SourceFile } from 'ts-morph';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import {
    createLocalScope,
    createEvaluationBudget,
    type EvaluationContext
} from './evaluation-context.ts';
import type { EvaluatedValue } from './primitive-value.ts';
import { evaluateExpression } from './expression-evaluation.ts';
import { evaluateStatement } from './statement-evaluation.ts';
import { constantValueFor, type KnownConstants } from './constant-binding.ts';
import { primitiveResult, type AbstractValue } from './abstract-value.ts';
import { createCallEvaluator } from './callee-evaluation.ts';

const maximumEvaluationSteps = 2048;

export function createEvaluationContext(
    call: EvaluationContext['call'],
    readConstant: EvaluationContext['readConstant']
): EvaluationContext {
    return {
        locals: createLocalScope(new Map()),
        depth: 0,
        readConstant,
        consume: createEvaluationBudget(maximumEvaluationSteps),
        evaluate: evaluateExpression,
        execute: evaluateStatement,
        call
    };
}

export function createBoundedEvaluator(
    sourceFile: SourceFile,
    values: KnownConstants
): (expression: TypeScriptMorphNode) => AbstractValue | undefined {
    const evaluateCallSite = createCallEvaluator(sourceFile);
    const sourceIsValid = runtimeSourceIsValid(sourceFile);
    return function (expression) {
        if (!sourceIsValid) {
            return undefined;
        }
        const context = createEvaluationContext(evaluateCallSite(), function (identifier) {
            return constantValueFor(identifier, values, expression);
        });
        return context.evaluate(expression, context);
    };
}

export function createConstantEvaluator(
    sourceFile: SourceFile,
    values: KnownConstants
): (expression: Expression) => EvaluatedValue | undefined {
    const evaluate = createBoundedEvaluator(sourceFile, values);
    return function (expression) {
        return primitiveResult(evaluate(expression));
    };
}

export function evaluateLocalCall(call: CallExpression): EvaluatedValue | undefined {
    return createConstantEvaluator(call.getSourceFile(), new Map())(call);
}
