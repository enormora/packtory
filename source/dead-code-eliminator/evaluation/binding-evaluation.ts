import {
    Node as TypeScriptMorphNode,
    type BindingElement,
    type ObjectBindingPattern,
    type VariableDeclaration
} from 'ts-morph';
import { evaluatePropertyKey } from './property-key-evaluation.ts';
import { isPrimitiveResult, type AbstractValue } from './abstract-value.ts';
import { createBindingReference, maximumEvaluationDepth, type EvaluationContext } from './evaluation-context.ts';

type LocalBinding = BindingElement | VariableDeclaration;
type BindingInitializer = (element: BindingElement, value: AbstractValue, context: EvaluationContext) => boolean;

function bindingValue(
    element: BindingElement,
    value: AbstractValue,
    context: EvaluationContext
): AbstractValue | undefined {
    const fallback = element.getInitializer();
    return fallback !== undefined && value.value === undefined ? context.evaluate(fallback, context) : value;
}

function bindingKey(element: BindingElement, context: EvaluationContext): string | undefined {
    const name = element.getPropertyNameNode() ?? element.getNameNode();
    return evaluatePropertyKey(name, context);
}

function initializeObjectBinding(
    pattern: ObjectBindingPattern,
    value: AbstractValue,
    context: EvaluationContext,
    initialize: BindingInitializer
): boolean {
    if (isPrimitiveResult(value)) {
        return false;
    }
    const local = { ...context, depth: context.depth + 1 };
    return pattern.getElements().every(function (element) {
        if (element.getDotDotDotToken() !== undefined) {
            return false;
        }
        const key = bindingKey(element, local);
        const property = key === undefined ? undefined : value.value.propertyReference(key)?.value;
        const selected = property === undefined ? undefined : bindingValue(element, property, local);
        return selected !== undefined && initialize(element, selected, local);
    });
}

export function initializeLocalBinding(
    declaration: LocalBinding,
    value: AbstractValue,
    writable: boolean,
    context: EvaluationContext
): boolean {
    if (context.depth >= maximumEvaluationDepth || !context.consume()) {
        return false;
    }
    const name = declaration.getNameNode();
    if (TypeScriptMorphNode.isIdentifier(name)) {
        context.locals.set(declaration, createBindingReference(value, writable));
        return true;
    }
    return TypeScriptMorphNode.isObjectBindingPattern(name) &&
        initializeObjectBinding(name, value, context, function (element, selected, local) {
            return initializeLocalBinding(element, selected, writable, local);
        });
}
