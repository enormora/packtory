import {
    SyntaxKind,
    type Expression,
    type SourceFile
} from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { createConstantBindingValues, localReadHasNoEffects, type KnownConstants } from './constant-binding.ts';
import { createBoundedEvaluator } from './local-call.ts';
import type { EvaluatedValue } from './primitive-value.ts';
import { primitiveResult, type AbstractValue } from './abstract-value.ts';
import { createRuntimeBoundedEvaluator } from './runtime-evaluation.ts';

export type PrimitiveEvaluator = (expression: Expression) => EvaluatedValue | undefined;
export type SourceEvaluation = {
    readonly knownValue: (expression: Expression) => AbstractValue | undefined;
    readonly primitiveValue: PrimitiveEvaluator;
    readonly canDiscard: (expression: Expression) => boolean;
};

export function createSourceEvaluations(
    evaluateSource: (source: SourceFile) => SourceEvaluation
): (source: SourceFile) => SourceEvaluation {
    const evaluations = new WeakMap<SourceFile, SourceEvaluation>();
    return function (source) {
        const evaluation = evaluations.get(source) ?? evaluateSource(source);
        evaluations.set(source, evaluation);
        return evaluation;
    };
}

function evaluateSourceConstants(
    sourceFile: SourceFile,
    createEvaluator: typeof createBoundedEvaluator
): SourceEvaluation {
    let bounded: SourceEvaluation['knownValue'] | null = null;
    const evaluation: { readonly values: KnownConstants; readonly evaluate: SourceEvaluation['knownValue']; } = {
        values: createConstantBindingValues(
            sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration),
            function (expression) {
                return primitiveResult(evaluation.evaluate(expression));
            }
        ),
        get evaluate() {
            bounded = bounded ?? createEvaluator(sourceFile, evaluation.values);
            return bounded;
        }
    };
    const { evaluate } = evaluation;
    const primitiveValue: PrimitiveEvaluator = function (expression) {
        return primitiveResult(evaluate(expression));
    };
    return {
        knownValue: evaluate,
        primitiveValue,
        canDiscard(expression) {
            return localReadHasNoEffects(unwrapExpression(expression)) || evaluate(expression) !== undefined;
        }
    };
}

function sourceEvaluation(sourceFile: SourceFile, createEvaluator: typeof createBoundedEvaluator): SourceEvaluation {
    let evaluation: SourceEvaluation | null = null;
    return {
        knownValue(expression) {
            evaluation = evaluation ?? evaluateSourceConstants(sourceFile, createEvaluator);
            return evaluation.knownValue(expression);
        },
        primitiveValue(expression) {
            evaluation = evaluation ?? evaluateSourceConstants(sourceFile, createEvaluator);
            return evaluation.primitiveValue(expression);
        },
        canDiscard(expression) {
            evaluation = evaluation ?? evaluateSourceConstants(sourceFile, createEvaluator);
            return evaluation.canDiscard(expression);
        }
    };
}

export function createSourceEvaluation(sourceFile: SourceFile): SourceEvaluation {
    return sourceEvaluation(sourceFile, createBoundedEvaluator);
}

export function createRuntimeSourceEvaluation(sourceFile: SourceFile): SourceEvaluation {
    return sourceEvaluation(sourceFile, createRuntimeBoundedEvaluator);
}
