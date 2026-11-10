import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type GetAccessorDeclaration,
    type MethodDeclaration,
    type SetAccessorDeclaration,
    type ReturnStatement,
    type Node as TypeScriptMorphNodeType,
    type ObjectLiteralExpression
} from 'ts-morph';
import { hasProp, isDefined } from 'remeda';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { returnCreationIsPure, staticPropertyName } from '../liveness/builder-return.ts';
import type { PrimitiveEvaluator } from './constant-evaluation.ts';
import type { PrimitiveValue } from './primitive-value.ts';

type KnownPropertyValue = { readonly type: 'value'; readonly value: PrimitiveValue; };
type PropertyValue = KnownPropertyValue | { readonly type: 'defined'; } | { readonly type: 'unknown'; };

export type ObjectPropertyRead = {
    readonly getIsPure: boolean;
    readonly value: PropertyValue;
};

type ShapeField = {
    readonly type: 'field';
    readonly key: string;
    readonly read: ObjectPropertyRead;
    readonly creationIsPure: boolean;
};
type ShapeEntry = ShapeField | { readonly type: 'null-prototype'; };

export type ObjectReadShape = {
    readonly creationIsPure: boolean;
    readonly propertyRead: (key: string) => ObjectPropertyRead | undefined;
};

function propertyValue(expression: Expression, evaluate: PrimitiveEvaluator): PropertyValue {
    const known = evaluate(expression);
    if (known !== undefined) {
        return { type: 'value', value: known.value };
    }
    return { type: returnCreationIsPure(expression, new Set()) ? 'defined' : 'unknown' };
}

function getterReturn(getter: GetAccessorDeclaration): ReturnStatement | undefined {
    const body = getter.getBody()?.asKind(SyntaxKind.Block);
    const statements = body?.getStatements() ?? [];
    return statements.length === 1 ? statements.find(TypeScriptMorphNode.isReturnStatement) : undefined;
}

function getterValue(getter: GetAccessorDeclaration, evaluate: PrimitiveEvaluator): PropertyValue {
    const statement = getterReturn(getter);
    if (statement === undefined) {
        return { type: 'unknown' };
    }
    const expression = statement.getExpression();
    return expression === undefined ? { type: 'value', value: undefined } : propertyValue(expression, evaluate);
}

function dataEntry(key: string, expression: Expression, evaluate: PrimitiveEvaluator): ShapeEntry | undefined {
    if (key === '__proto__') {
        return unwrapExpression(expression).getKind() === SyntaxKind.NullKeyword
            ? { type: 'null-prototype' }
            : undefined;
    }
    const value = propertyValue(expression, evaluate);
    return { type: 'field', key, read: { getIsPure: true, value }, creationIsPure: value.type !== 'unknown' };
}

type ObjectMethod = GetAccessorDeclaration | MethodDeclaration | SetAccessorDeclaration;

function memberValue(member: ObjectMethod, evaluate: PrimitiveEvaluator): PropertyValue {
    if (TypeScriptMorphNode.isGetAccessorDeclaration(member)) {
        return getterValue(member, evaluate);
    }
    return TypeScriptMorphNode.isMethodDeclaration(member)
        ? { type: 'defined' }
        : { type: 'value', value: undefined };
}

function memberEntry(member: ObjectMethod, evaluate: PrimitiveEvaluator): ShapeEntry | undefined {
    const key = staticPropertyName(member.getNameNode());
    const value = memberValue(member, evaluate);
    return key === undefined ? undefined : {
        type: 'field',
        key,
        read: { getIsPure: value.type !== 'unknown', value },
        creationIsPure: true
    };
}

function shapeEntry(property: TypeScriptMorphNodeType, evaluate: PrimitiveEvaluator): ShapeEntry | undefined {
    if (TypeScriptMorphNode.isPropertyAssignment(property)) {
        const key = staticPropertyName(property.getNameNode());
        return key === undefined ? undefined : dataEntry(key, property.getInitializerOrThrow(), evaluate);
    }
    if (
        TypeScriptMorphNode.isMethodDeclaration(property) || TypeScriptMorphNode.isSetAccessorDeclaration(property) ||
        TypeScriptMorphNode.isGetAccessorDeclaration(property)
    ) {
        return memberEntry(property, evaluate);
    }
    return undefined;
}

export function objectReadShape(
    object: ObjectLiteralExpression,
    evaluate: PrimitiveEvaluator
): ObjectReadShape | undefined {
    const entries = object.getProperties().map(function (property) {
        return shapeEntry(property, evaluate);
    });
    if (!entries.every(isDefined)) {
        return undefined;
    }
    const data = entries.flatMap(function (entry) {
        return entry.type === 'field' ? [ entry ] : [];
    });
    const fields = new Map(data.map(function (entry) {
        return [ entry.key, entry.read ];
    }));
    if (fields.size !== data.length) {
        return undefined;
    }
    const nullPrototype = entries.some(function (entry) {
        return entry.type === 'null-prototype';
    });
    return {
        creationIsPure: data.every(function (entry) {
            return entry.creationIsPure;
        }),
        propertyRead(key) {
            return fields.get(key) ?? (nullPrototype
                ? {
                    getIsPure: true,
                    value: { type: 'value', value: undefined }
                }
                : undefined);
        }
    };
}

export function propertyIsDefined(value: ObjectPropertyRead['value']): boolean {
    return value.type === 'defined' || hasProp(value, 'value') && value.value !== undefined;
}
