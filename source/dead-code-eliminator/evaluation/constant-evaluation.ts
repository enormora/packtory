import {
    SyntaxKind,
    type Expression,
    type SourceFile,
    type VariableDeclaration
} from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { evaluateConstantBindings, localReadHasNoEffects } from './constant-binding.ts';
import { createBoundedEvaluator } from './local-call.ts';
import type { EvaluatedValue } from './primitive-value.ts';
import { primitiveResult, type AbstractValue } from './abstract-value.ts';

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

function evaluateSourceConstants(sourceFile: SourceFile): SourceEvaluation {
    const values = new Map<VariableDeclaration, EvaluatedValue>();
    const evaluate = createBoundedEvaluator(sourceFile, values);
    const primitiveValue: PrimitiveEvaluator = function (expression) {
        return primitiveResult(evaluate(expression));
    };
    const declarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    for (const [ declaration, value ] of evaluateConstantBindings(declarations, primitiveValue)) {
        values.set(declaration, value);
    }
    return {
        knownValue: evaluate,
        primitiveValue,
        canDiscard(expression) {
            return localReadHasNoEffects(unwrapExpression(expression)) || evaluate(expression) !== undefined;
        }
    };
}

export function createSourceEvaluation(sourceFile: SourceFile): SourceEvaluation {
    let evaluation: SourceEvaluation | null = null;
    return {
        knownValue(expression) {
            evaluation = evaluation ?? evaluateSourceConstants(sourceFile);
            return evaluation.knownValue(expression);
        },
        primitiveValue(expression) {
            evaluation = evaluation ?? evaluateSourceConstants(sourceFile);
            return evaluation.primitiveValue(expression);
        },
        canDiscard(expression) {
            evaluation = evaluation ?? evaluateSourceConstants(sourceFile);
            return evaluation.canDiscard(expression);
        }
    };
}
