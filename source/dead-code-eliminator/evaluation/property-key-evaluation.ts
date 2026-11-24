import { Node as TypeScriptMorphNode, type Expression } from 'ts-morph';
import { staticPropertyName } from '../liveness/builder-return.ts';
import { isPrimitiveResult } from './abstract-value.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { evaluationEnvironmentOf } from './evaluation-environment.ts';

export function evaluateComputedKey(expression: Expression, context: EvaluationContext): string | undefined {
    const result = context.evaluate(expression, context);
    const key = result !== undefined && isPrimitiveResult(result)
        ? result
        : evaluationEnvironmentOf(expression.getSourceFile()).readImportedConstant(expression);
    return key === undefined ? undefined : String(key.value);
}

export function evaluatePropertyKey(name: TypeScriptMorphNode, context: EvaluationContext): string | undefined {
    return TypeScriptMorphNode.isComputedPropertyName(name)
        ? evaluateComputedKey(name.getExpression(), context)
        : staticPropertyName(name);
}
