import type { CallExpression, Expression, SourceFile } from 'ts-morph';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import {
    createLocalScope,
    type EvaluationContext
} from './evaluation-context.ts';
import type { EvaluatedValue } from './primitive-value.ts';
import { evaluateExpression } from './expression-evaluation.ts';
import { evaluateStatement } from './statement-evaluation.ts';
import { constantValueFor, type KnownConstants } from './constant-binding.ts';
import { primitiveResult, type AbstractValue } from './abstract-value.ts';
import { createCallEvaluator } from './callee-evaluation.ts';

const maximumEvaluationSteps = 2048;

export function createBoundedEvaluator(
    sourceFile: SourceFile,
    values: KnownConstants
): (expression: Expression) => AbstractValue | undefined {
    const evaluateCallSite = createCallEvaluator(sourceFile);
    const sourceIsValid = runtimeSourceIsValid(sourceFile);
    return function (expression) {
        if (!sourceIsValid) {
            return undefined;
        }
        let remaining = maximumEvaluationSteps;
        const context: EvaluationContext = {
            locals: createLocalScope(new Map()),
            depth: 0,
            readConstant(identifier) {
                return constantValueFor(identifier, values, expression);
            },
            consume() {
                remaining -= 1;
                return remaining >= 0;
            },
            evaluate: evaluateExpression,
            execute: evaluateStatement,
            call: evaluateCallSite()
        };
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
