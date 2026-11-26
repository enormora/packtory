import { Node as TypeScriptMorphNode, type NewExpression } from 'ts-morph';
import { hasPureCallAnnotation } from '../call-annotation.ts';
import type { EvaluationContext } from './evaluation-context.ts';

export function annotatedConstructionIsEffectFree(expression: NewExpression, context: EvaluationContext): boolean {
    if (!hasPureCallAnnotation(expression)) {
        return false;
    }
    return expression.getArguments().every(function (argument) {
        return !TypeScriptMorphNode.isSpreadElement(argument) && context.evaluate(argument, context) !== undefined;
    });
}
