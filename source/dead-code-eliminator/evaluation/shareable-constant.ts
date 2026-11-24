import { Node as TypeScriptMorphNode, type Expression, type VariableDeclaration } from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { isRecordResult, opaqueResult, type AbstractValue } from './abstract-value.ts';
import { constantArrayStaysIterable } from './iterable-array-binding.ts';

function objectLiteralIsSpreadSafe(initializer: Expression): boolean {
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
    return opaqueResult(objectLiteralIsSpreadSafe(initializer) ? 'object' : 'value');
}

export function shareableConstantValue(
    declaration: VariableDeclaration,
    value: AbstractValue | undefined
): AbstractValue | undefined {
    const initializer = unwrapExpression(declaration.getInitializer());
    if (value === undefined || initializer === undefined || !isRecordResult(value)) {
        return value;
    }
    return recordShape(declaration, initializer);
}
