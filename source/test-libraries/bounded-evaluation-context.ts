import { createLocalScope, type EvaluationContext } from '../dead-code-eliminator/evaluation/evaluation-context.ts';
import { evaluateExpression } from '../dead-code-eliminator/evaluation/expression-evaluation.ts';
import { evaluateStatement } from '../dead-code-eliminator/evaluation/statement-evaluation.ts';

export function createBoundedEvaluationContext(depth: number, fuel: number): EvaluationContext {
    let remaining = fuel;
    return {
        depth,
        locals: createLocalScope(new Map()),
        consume() {
            remaining -= 1;
            return remaining >= 0;
        },
        readConstant() {
            return undefined;
        },
        evaluate: evaluateExpression,
        execute: evaluateStatement,
        call() {
            return undefined;
        }
    };
}
