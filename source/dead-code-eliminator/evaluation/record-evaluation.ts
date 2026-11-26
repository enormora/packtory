import {
    Node as TypeScriptMorphNode,
    type Expression,
    type NewExpression,
    type ObjectLiteralExpression,
    type PropertyAssignment,
    type ShorthandPropertyAssignment,
    type SpreadAssignment,
    type Node as TypeScriptMorphNodeType
} from 'ts-morph';
import { objectMember, staticPropertyName, type ObjectMember } from '../liveness/builder-return.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { evaluated } from './primitive-value.ts';
import {
    isRecordResult,
    isSpreadSafeObjectResult,
    opaqueResult,
    type AbstractValue,
    type AllocatedRecord,
    type EvaluationReference
} from './abstract-value.ts';
import { maximumEvaluationDepth, type EvaluationContext } from './evaluation-context.ts';
import { evaluateComputedKey, evaluatePropertyKey } from './property-key-evaluation.ts';
import { evaluateConstructionEffects } from './construction-evaluation.ts';
import { nonLocalConstructionIsEffectFree } from './intrinsic-construction.ts';
import { objectLiteralIsSpreadSafe } from './shareable-constant.ts';

type RecordDataField = {
    readonly type: 'data';
    readonly key: string;
    readonly value: AbstractValue;
    readonly prototype: boolean;
};
type OpaqueField = { readonly type: 'opaque'; readonly key: string; readonly prototype: false; };
type RecordField = OpaqueField | RecordDataField;
type StoredRecordField = Pick<OpaqueField, 'type'> | Pick<RecordDataField, 'type' | 'value'>;
type RecordAllocation = {
    readonly value: AllocatedRecord;
    readonly addField: (field: RecordField | undefined) => boolean;
};

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
        return { type: 'opaque', key, prototype: false };
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
    const key = evaluatePropertyKey(property.getNameNode(), context);
    if (key === undefined) {
        return undefined;
    }
    return TypeScriptMorphNode.isPropertyAssignment(property)
        ? assignedField(property, key, context)
        : { type: 'opaque', key, prototype: false };
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
    const properties = new Map<string, StoredRecordField>();
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
                    properties.set(key, { type: 'data', value: next });
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
            if (field.prototype) {
                nullPrototype = field.value.value === null;
                return nullPrototype;
            }
            properties.set(field.key, field);
            return true;
        }
    };
}

function spreadSourceIsSafe(property: SpreadAssignment, context: EvaluationContext): boolean {
    const source = unwrapExpression(property.getExpression());
    const value = context.evaluate(source, context);
    if (value === undefined) {
        return false;
    }
    return isSpreadSafeObjectResult(value) || isRecordResult(value) && objectLiteralIsSpreadSafe(source);
}

function spreadObjectShape(object: ObjectLiteralExpression, context: EvaluationContext): AbstractValue | undefined {
    const complete = object.getProperties().every(function (property) {
        return TypeScriptMorphNode.isSpreadAssignment(property)
            ? spreadSourceIsSafe(property, context)
            : recordField(property, context) !== undefined;
    });
    const hasAccessors = object.getProperties().some(function (property) {
        return TypeScriptMorphNode.isGetAccessorDeclaration(property) ||
            TypeScriptMorphNode.isSetAccessorDeclaration(property);
    });
    if (!complete) {
        return undefined;
    }
    return opaqueResult(hasAccessors ? 'value' : 'object');
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
    if (complete) {
        return { value: allocation.value };
    }
    return object.getProperties().some(TypeScriptMorphNode.isSpreadAssignment)
        ? spreadObjectShape(object, local)
        : undefined;
}

function propertyReference(
    receiver: AbstractValue | undefined,
    key: string | undefined
): EvaluationReference | undefined {
    if (key === undefined || receiver === undefined || !isRecordResult(receiver)) {
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
        const key = expression.getArgumentExpressionOrThrow();
        return propertyReference(
            context.evaluate(expression.getExpression(), context),
            evaluateComputedKey(key, context)
        );
    }
    return undefined;
}

function constructionValue(expression: NewExpression, context: EvaluationContext): AbstractValue | undefined {
    const effectFree = evaluateConstructionEffects(expression, context) ||
        nonLocalConstructionIsEffectFree(expression, context);
    return effectFree ? { value: createRecordAllocation().value } : undefined;
}

export function evaluateRecordExpression(
    expression: Expression,
    context: EvaluationContext
): AbstractValue | undefined {
    if (TypeScriptMorphNode.isNewExpression(expression)) {
        return constructionValue(expression, context);
    }
    return TypeScriptMorphNode.isObjectLiteralExpression(expression)
        ? allocateRecord(expression, context)
        : recordPropertyReference(expression, context)?.value;
}
