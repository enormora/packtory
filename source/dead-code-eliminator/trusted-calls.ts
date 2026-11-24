import { Node as TypeScriptMorphNode, type CallExpression, type NewExpression } from 'ts-morph';
import { hasPureCallAnnotation } from './call-annotation.ts';
import { resolvesToGlobal } from './evaluation/global-reference.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import {
    arePureCallArguments,
    type ExpressionPurityChecker,
    type PurityContext
} from './imported-expression-origin.ts';

export function annotationTrustsCall(
    expression: CallExpression | NewExpression,
    isPure: ExpressionPurityChecker
): boolean {
    return hasPureCallAnnotation(expression) && arePureCallArguments(expression.getArguments(), isPure);
}

export function settingsTrustConstruction(
    expression: NewExpression,
    context: PurityContext,
    isPure: ExpressionPurityChecker
): boolean {
    const constructorExpression = unwrapExpression(expression.getExpression());
    return TypeScriptMorphNode.isIdentifier(constructorExpression) &&
        resolvesToGlobal(constructorExpression) &&
        context.settings?.pureConstructors?.includes(constructorExpression.getText()) === true &&
        arePureCallArguments(expression.getArguments(), isPure);
}
