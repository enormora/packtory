import { Node as TypeScriptMorphNode, type Expression, type VariableDeclaration } from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { isRecordResult, opaqueResult, type AbstractValue } from './abstract-value.ts';
import { bindingIsMutated } from './binding-mutation.ts';
import { constantArrayStaysIterable, constantObjectStaysSpreadSafe } from './constant-shape.ts';

export function objectLiteralIsSpreadSafe(initializer: Expression): boolean {
    return TypeScriptMorphNode.isObjectLiteralExpression(initializer) &&
        initializer.getProperties().every(function (property) {
            return !TypeScriptMorphNode.isGetAccessorDeclaration(property) &&
                !TypeScriptMorphNode.isSetAccessorDeclaration(property);
        });
}

function recordShape(declaration: VariableDeclaration, initializer: Expression): AbstractValue {
    if (TypeScriptMorphNode.isArrayLiteralExpression(initializer) && constantArrayStaysIterable(declaration)) {
        return opaqueResult('array');
    }
    const spreadSafe = objectLiteralIsSpreadSafe(initializer) && constantObjectStaysSpreadSafe(declaration);
    return opaqueResult(spreadSafe ? 'object' : 'value');
}

export function shareableConstantValue(
    declaration: VariableDeclaration,
    value: AbstractValue | undefined
): AbstractValue | undefined {
    const name = declaration.getNameNode();
    if (value === undefined || !TypeScriptMorphNode.isIdentifier(name)) {
        return value;
    }
    if (bindingIsMutated(name)) {
        return opaqueResult('value');
    }
    return isRecordResult(value)
        ? recordShape(declaration, unwrapExpression(declaration.getInitializerOrThrow()))
        : value;
}
