import {
    Node as TypeScriptMorphNode,
    type Expression,
    type ObjectLiteralExpression,
    type PropertyAssignment,
    type PropertyName,
    type ShorthandPropertyAssignment,
    type Node as TypeScriptMorphNodeType
} from 'ts-morph';
import { objectMember, staticPropertyName, type ObjectMember } from '../liveness/builder-return.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { evaluated } from './primitive-value.ts';
import {
    isPrimitiveResult,
    type AbstractValue,
    type AllocatedRecord,
    type EvaluationReference
} from './abstract-value.ts';
import { maximumEvaluationDepth, type EvaluationContext } from './evaluation-context.ts';
import { evaluateConstructionEffects } from './construction-evaluation.ts';

type RecordDataField = {
    readonly type: 'data';
    readonly key: string;
    readonly value: AbstractValue;
    readonly prototype: boolean;
};
type OpaqueField = { readonly type: 'opaque'; readonly key: string; };
type RecordField = OpaqueField | RecordDataField;
type RecordAllocation = {
    readonly value: AllocatedRecord;
    readonly addField: (field: RecordField | undefined) => boolean;
};

function computedKey(expression: Expression, context: EvaluationContext): string | undefined {
    const result = context.evaluate(expression, context);
    return result !== undefined && isPrimitiveResult(result) ? String(result.value) : undefined;
}

function propertyKey(name: PropertyName, context: EvaluationContext): string | undefined {
    return TypeScriptMorphNode.isComputedPropertyName(name)
        ? computedKey(name.getExpression(), context)
        : staticPropertyName(name);
}

function shorthandField(property: ShorthandPropertyAssignment, context: EvaluationContext): RecordField | undefined {
    const value = context.evaluate(property.getNameNode(), context);
    return value === undefined
        ? undefined
        : { type: 'data', key: property.getNameNode().compilerNode.text, value, prototype: false };
}

function assignedField(property: PropertyAssignment, key: string, context: EvaluationContext): RecordField | undefined {
    const name = property.getNameNode();
    const prototype = key === '__proto__' && !TypeScriptMorphNode.isComputedPropertyName(name);
    const initializer = unwrapExpression(property.getInitializerOrThrow());
    if (
        !prototype &&
        (TypeScriptMorphNode.isArrowFunction(initializer) || TypeScriptMorphNode.isFunctionExpression(initializer))
    ) {
        return { type: 'opaque', key };
    }
    const value = context.evaluate(initializer, context);
    return value === undefined ? undefined : {
        type: 'data',
        key,
        value,
        prototype
    };
}

function namedRecordField(property: ObjectMember, context: EvaluationContext): RecordField | undefined {
    const key = propertyKey(property.getNameNode(), context);
    if (key === undefined) {
        return undefined;
    }
    return TypeScriptMorphNode.isPropertyAssignment(property)
        ? assignedField(property, key, context)
        : { type: 'opaque', key };
}

function recordField(property: TypeScriptMorphNodeType, context: EvaluationContext): RecordField | undefined {
    if (!context.consume()) {
        return undefined;
    }
    if (TypeScriptMorphNode.isShorthandPropertyAssignment(property)) {
        return shorthandField(property, context);
    }
    const member = objectMember(property);
    return member === undefined ? undefined : namedRecordField(member, context);
}

function createRecordAllocation(): RecordAllocation {
    const properties = new Map<string, RecordField>();
    let nullPrototype = false;
    const value: AllocatedRecord = {
        propertyReference(key) {
            const field = properties.get(key);
            if (field?.type === 'opaque' || !nullPrototype && field === undefined) {
                return undefined;
            }
            return {
                get value() {
                    const current = properties.get(key);
                    return current?.type === 'data' ? current.value : evaluated(undefined);
                },
                assign(next) {
                    properties.set(key, { type: 'data', key, value: next, prototype: false });
                    return next;
                }
            };
        }
    };
    return {
        value,
        addField(field) {
            if (field === undefined) {
                return false;
            }
            if (field.type === 'data' && field.prototype) {
                nullPrototype = field.value.value === null;
                return nullPrototype;
            }
            properties.set(field.key, field);
            return true;
        }
    };
}

function allocateRecord(object: ObjectLiteralExpression, context: EvaluationContext): AbstractValue | undefined {
    if (context.depth >= maximumEvaluationDepth) {
        return undefined;
    }
    const local = { ...context, depth: context.depth + 1 };
    const allocation = createRecordAllocation();
    const complete = object.getProperties().every(function (property) {
        return allocation.addField(recordField(property, local));
    });
    return complete ? { value: allocation.value } : undefined;
}

function propertyReference(
    receiver: AbstractValue | undefined,
    key: string | undefined
): EvaluationReference | undefined {
    if (key === undefined || receiver === undefined || isPrimitiveResult(receiver)) {
        return undefined;
    }
    return receiver.value.propertyReference(key);
}

export function recordPropertyReference(
    expression: Expression,
    context: EvaluationContext
): EvaluationReference | undefined {
    if (TypeScriptMorphNode.isPropertyAccessExpression(expression)) {
        return propertyReference(
            context.evaluate(expression.getExpression(), context),
            staticPropertyName(expression.getNameNode())
        );
    }
    if (TypeScriptMorphNode.isElementAccessExpression(expression)) {
        const key = expression.getArgumentExpression();
        return key === undefined
            ? undefined
            : propertyReference(context.evaluate(expression.getExpression(), context), computedKey(key, context));
    }
    return undefined;
}

export function evaluateRecordExpression(
    expression: Expression,
    context: EvaluationContext
): AbstractValue | undefined {
    if (TypeScriptMorphNode.isNewExpression(expression)) {
        return evaluateConstructionEffects(expression, context) ? { value: createRecordAllocation().value } : undefined;
    }
    return TypeScriptMorphNode.isObjectLiteralExpression(expression)
        ? allocateRecord(expression, context)
        : recordPropertyReference(expression, context)?.value;
}
