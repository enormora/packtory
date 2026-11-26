import type { Node as TypeScriptMorphNode, SourceFile } from 'ts-morph';
import {
    createLocalScope,
    createEvaluationBudget,
    type EvaluationContext
} from './evaluation-context.ts';
import { evaluateExpression } from './expression-evaluation.ts';
import { evaluateStatement } from './statement-evaluation.ts';
import { constantValueFor, type KnownConstants } from './constant-binding.ts';
import type { AbstractValue } from './abstract-value.ts';
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
    return function (expression) {
        const context = createEvaluationContext(evaluateCallSite(), function (identifier) {
            return constantValueFor(identifier, values, expression);
        });
        return context.evaluate(expression, context);
    };
}
