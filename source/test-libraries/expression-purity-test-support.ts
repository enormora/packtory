import type { Expression } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import { createExpressionPurityChecker } from '../dead-code-eliminator/pure-expression.ts';
import { resolveRuntimeModule } from '../dead-code-eliminator/runtime-module-resolution.ts';
import { establishIntrinsicIntegrity } from '../dead-code-eliminator/evaluation/intrinsic-integrity.ts';

export function isPureExpression(expression: Expression, settings: DeadCodeEliminationSettings | undefined): boolean {
    establishIntrinsicIntegrity(expression.getSourceFile().getProject().getSourceFiles());
    return createExpressionPurityChecker(settings, resolveRuntimeModule)(expression);
}
