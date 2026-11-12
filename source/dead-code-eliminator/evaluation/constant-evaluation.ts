import {
    SyntaxKind,
    type Expression,
    type SourceFile,
    type VariableDeclaration
} from 'ts-morph';
import { evaluateConstantBindings } from './constant-binding.ts';
import { createBoundedEvaluator } from './local-call.ts';
import type { EvaluatedValue } from './primitive-value.ts';
import { primitiveResult } from './abstract-value.ts';

export type PrimitiveEvaluator = (expression: Expression) => EvaluatedValue | undefined;
export type SourceEvaluation = {
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
        primitiveValue,
        canDiscard(expression) {
            return evaluate(expression) !== undefined;
        }
    };
}

export function createSourceEvaluation(sourceFile: SourceFile): SourceEvaluation {
    let evaluation: SourceEvaluation | null = null;
    return {
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
