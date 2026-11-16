import { Node as TypeScriptMorphNode, type Expression } from 'ts-morph';
import { staticPropertyName } from '../liveness/builder-return.ts';
import { isPrimitiveResult } from './abstract-value.ts';
import type { EvaluationContext } from './evaluation-context.ts';

export function evaluateComputedKey(expression: Expression, context: EvaluationContext): string | undefined {
    const result = context.evaluate(expression, context);
    return result !== undefined && isPrimitiveResult(result) ? String(result.value) : undefined;
}

export function evaluatePropertyKey(name: TypeScriptMorphNode, context: EvaluationContext): string | undefined {
    return TypeScriptMorphNode.isComputedPropertyName(name)
        ? evaluateComputedKey(name.getExpression(), context)
        : staticPropertyName(name);
}
