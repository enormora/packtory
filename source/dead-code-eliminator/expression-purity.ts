import type { ts } from 'ts-morph';
import { createRuntimeSourceEvaluation, type SourceEvaluation } from './evaluation/constant-evaluation.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import type { ExpressionPurityChecker } from './imported-expression-origin.ts';

export function createExpressionPurityChecker(): ExpressionPurityChecker {
    const evaluations = new WeakMap<ts.SourceFile, SourceEvaluation>();
    return function (expression) {
        const source = expression.getSourceFile();
        const evaluation = evaluations.get(source.compilerNode) ?? createRuntimeSourceEvaluation(source);
        evaluations.set(source.compilerNode, evaluation);
        return evaluation.knownValue(unwrapExpression(expression)) !== undefined;
    };
}
