import type { Expression } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import { createExpressionPurityChecker } from '../dead-code-eliminator/expression-purity.ts';
import { resolveRuntimeModule } from '../dead-code-eliminator/runtime-module-resolution.ts';
import { establishEvaluationEnvironment } from '../dead-code-eliminator/evaluation/evaluation-environment-establishment.ts';

export function isPureExpression(expression: Expression, settings: DeadCodeEliminationSettings | undefined): boolean {
    establishEvaluationEnvironment(
        expression.getSourceFile().getProject().getSourceFiles(),
        settings,
        resolveRuntimeModule
    );
    return createExpressionPurityChecker()(expression);
}
