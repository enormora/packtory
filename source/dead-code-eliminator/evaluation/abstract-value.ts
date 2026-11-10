import { SyntaxKind } from 'ts-morph';
import {
    evaluated,
    isTruthy,
    evaluatePrimitiveBinary,
    evaluatePrimitiveUnary,
    type EvaluatedValue
} from './primitive-value.ts';

export type AllocatedRecord = {
    readonly propertyReference: (key: string) => EvaluationReference | undefined;
};

export type AbstractValue = EvaluatedValue | { readonly value: AllocatedRecord; };

export type EvaluationReference = {
    readonly value: AbstractValue;
    readonly assign: (value: AbstractValue) => AbstractValue | undefined;
};

export function isPrimitiveResult(result: AbstractValue): result is EvaluatedValue {
    return result.value === null || typeof result.value !== 'object';
}

export function primitiveResult(result: AbstractValue | undefined): EvaluatedValue | undefined {
    return result !== undefined && isPrimitiveResult(result) ? result : undefined;
}

export function evaluateAbstractUnary(operator: SyntaxKind, operand: AbstractValue): EvaluatedValue | undefined {
    if (operator === SyntaxKind.ExclamationToken) {
        return evaluated(!isTruthy(operand.value));
    }
    return isPrimitiveResult(operand) ? evaluatePrimitiveUnary(operator, operand.value) : undefined;
}

export function evaluateAbstractBinary(
    operator: SyntaxKind,
    left: AbstractValue,
    right: AbstractValue
): AbstractValue | undefined {
    if (operator === SyntaxKind.CommaToken) {
        return right;
    }
    if (operator === SyntaxKind.EqualsEqualsEqualsToken) {
        return evaluated(left.value === right.value);
    }
    if (operator === SyntaxKind.ExclamationEqualsEqualsToken) {
        return evaluated(left.value !== right.value);
    }
    return isPrimitiveResult(left) && isPrimitiveResult(right)
        ? evaluatePrimitiveBinary(operator, left.value, right.value)
        : undefined;
}
