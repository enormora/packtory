import type { Expression } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import { createExpressionPurityChecker } from '../dead-code-eliminator/pure-expression.ts';
import { resolveRuntimeModule } from '../dead-code-eliminator/runtime-module-resolution.ts';

export function isPureExpression(expression: Expression, settings: DeadCodeEliminationSettings | undefined): boolean {
    return createExpressionPurityChecker(settings, resolveRuntimeModule)(expression);
}
