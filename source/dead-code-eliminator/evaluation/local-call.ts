import {
    Node as TypeScriptMorphNode,
    type CallExpression,
    type Expression,
    type SourceFile
} from 'ts-morph';
import { isDefined } from 'remeda';
import {
    createCallTargetResolver,
    type CallTargetResolver,
    type LocalFunction
} from './call-target.ts';
import {
    createLocalScope,
    maximumEvaluationDepth,
    type EvaluationContext
} from './evaluation-context.ts';
import type { EvaluatedValue } from './primitive-value.ts';
import { evaluateExpression } from './expression-evaluation.ts';
import { evaluateStatement } from './statement-evaluation.ts';
import { constantValueFor, type KnownConstants } from './constant-binding.ts';
import { primitiveResult, type AbstractValue } from './abstract-value.ts';
import { createCalleeEvaluation, type CalleeEvaluation } from './callee-evaluation.ts';

const maximumEvaluationSteps = 2048;

function functionIsSynchronous(target: LocalFunction): boolean {
    return !target.isAsync() && (TypeScriptMorphNode.isArrowFunction(target) || !target.isGenerator());
}

function evaluateCall(
    call: CallExpression,
    context: EvaluationContext,
    resolveTarget: CallTargetResolver,
    evaluateResult: CalleeEvaluation
): AbstractValue | undefined {
    if (context.depth >= maximumEvaluationDepth) {
        return undefined;
    }
    const values = call.getArguments().map(function (argument) {
        return context.evaluate(argument, context);
    });
    if (!values.every(isDefined)) {
        return undefined;
    }
    const target = resolveTarget(call);
    if (target === undefined) {
        return undefined;
    }
    return evaluateResult(target, values, context);
}

function createCallEvaluator(sourceFile: SourceFile): () => EvaluationContext['call'] {
    const resolveTarget = createCallTargetResolver(sourceFile, functionIsSynchronous);
    return function () {
        const evaluateResult = createCalleeEvaluation();
        return function (call, context) {
            return evaluateCall(call, context, resolveTarget, evaluateResult);
        };
    };
}

export function createBoundedEvaluator(
    sourceFile: SourceFile,
    values: KnownConstants
): (expression: Expression) => AbstractValue | undefined {
    const evaluateCallSite = createCallEvaluator(sourceFile);
    const hasSyntaxErrors = sourceFile.getProject().getProgram().getSyntacticDiagnostics(sourceFile).length > 0;
    return function (expression) {
        if (hasSyntaxErrors) {
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
