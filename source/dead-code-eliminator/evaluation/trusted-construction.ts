import { Node as TypeScriptMorphNode, type NewExpression } from 'ts-morph';
import { hasPureCallAnnotation } from '../call-annotation.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { evaluationEnvironmentOf } from './evaluation-environment.ts';
import { resolvesToGlobal } from './global-reference.ts';

function settingsTrustConstructor(expression: NewExpression): boolean {
    const constructorExpression = unwrapExpression(expression.getExpression());
    const { settings } = evaluationEnvironmentOf(expression.getSourceFile());
    return TypeScriptMorphNode.isIdentifier(constructorExpression) && resolvesToGlobal(constructorExpression) &&
        settings?.pureConstructors?.includes(constructorExpression.getText()) === true;
}

export function trustedConstructionIsEffectFree(expression: NewExpression, context: EvaluationContext): boolean {
    if (!hasPureCallAnnotation(expression) && !settingsTrustConstructor(expression)) {
        return false;
    }
    return expression.getArguments().every(function (argument) {
        return !TypeScriptMorphNode.isSpreadElement(argument) && context.evaluate(argument, context) !== undefined;
    });
}
