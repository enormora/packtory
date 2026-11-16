import { Node as TypeScriptMorphNode, type Expression } from 'ts-morph';
import { expressionWithWrappers } from './expression-unwrapping.ts';

export function callObservesReceiver(value: Expression): boolean {
    const expression = expressionWithWrappers(value);
    const parent = expression.getParent();
    return TypeScriptMorphNode.isCallExpression(parent) && parent.getExpression() === expression ||
        TypeScriptMorphNode.isTaggedTemplateExpression(parent);
}
