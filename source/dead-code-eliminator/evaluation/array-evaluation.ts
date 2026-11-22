import { Node as TypeScriptMorphNode, type ArrayLiteralExpression } from 'ts-morph';
import { createBindingReference, maximumEvaluationDepth, type EvaluationContext } from './evaluation-context.ts';
import { evaluated } from './primitive-value.ts';
import type { AbstractValue, EvaluationReference } from './abstract-value.ts';

export function evaluateArray(array: ArrayLiteralExpression, context: EvaluationContext): AbstractValue | undefined {
    if (context.depth >= maximumEvaluationDepth) {
        return undefined;
    }
    const elements = array.getElements();
    const properties = new Map<string, EvaluationReference>([
        [ 'length', createBindingReference(evaluated(elements.length), false) ]
    ]);
    const local = { ...context, depth: context.depth + 1 };
    const complete = elements.every(function (element, index) {
        if (!context.consume()) {
            return false;
        }
        if (TypeScriptMorphNode.isOmittedExpression(element)) {
            return true;
        }
        const value = context.evaluate(element, local);
        if (value === undefined) {
            return false;
        }
        properties.set(String(index), createBindingReference(value, true));
        return true;
    });
    return complete
        ? {
            value: {
                propertyReference(key) {
                    return properties.get(key);
                }
            }
        }
        : undefined;
}
