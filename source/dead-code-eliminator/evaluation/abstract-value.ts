import { isTruthy } from 'remeda';
import { SyntaxKind } from 'ts-morph';
import {
    evaluated,
    evaluatePrimitiveBinary,
    evaluatePrimitiveUnary,
    bigintOverflowIsNonzeroAndEffectFree,
    type EvaluatedValue
} from './primitive-value.ts';

export type AllocatedRecord = {
    readonly propertyReference: (key: string) => EvaluationReference | undefined;
};

type RecordResult = { readonly value: AllocatedRecord; };

type SymbolResult = { readonly value: symbol; };

type OpaqueKind = 'array' | 'oversized-bigint';

type OpaqueResult = { readonly value: { readonly opaque: OpaqueKind; }; };

export type AbstractValue = EvaluatedValue | OpaqueResult | RecordResult | SymbolResult;

export type EvaluationReference = {
    readonly value: AbstractValue;
    readonly assign: (value: AbstractValue) => AbstractValue | undefined;
};

export function isPrimitiveResult(result: AbstractValue): result is EvaluatedValue {
    return result.value === null || typeof result.value !== 'object' && typeof result.value !== 'symbol';
}

function isOpaqueResult(result: AbstractValue): result is OpaqueResult {
    return result.value !== null && typeof result.value === 'object' && Object.hasOwn(result.value, 'opaque');
}

export function opaqueResult(kind: OpaqueKind): OpaqueResult {
    return { value: { opaque: kind } };
}

export function isOpaqueArrayResult(result: AbstractValue): boolean {
    return isOpaqueResult(result) && result.value.opaque === 'array';
}

export function isRecordResult(result: AbstractValue): result is RecordResult {
    return result.value !== null && typeof result.value === 'object' &&
        Object.hasOwn(result.value, 'propertyReference');
}

export function typeOfResult(result: AbstractValue): string {
    if (!isOpaqueResult(result)) {
        return typeof result.value;
    }
    return result.value.opaque === 'oversized-bigint' ? 'bigint' : 'object';
}

export function strictlyEqualResults(left: AbstractValue, right: AbstractValue): boolean | undefined {
    if (isOpaqueResult(left) || isOpaqueResult(right)) {
        return undefined;
    }
    return left.value === right.value;
}

function oversizedBigIntResult(
    operator: SyntaxKind,
    left: AbstractValue,
    right: AbstractValue
): OpaqueResult | undefined {
    return bigintOverflowIsNonzeroAndEffectFree(operator, left.value, right.value)
        ? opaqueResult('oversized-bigint')
        : undefined;
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

function strictEqualityResult(
    operator: SyntaxKind,
    left: AbstractValue,
    right: AbstractValue
): EvaluatedValue | undefined {
    const equal = strictlyEqualResults(left, right);
    if (equal === undefined) {
        return undefined;
    }
    return evaluated(operator === SyntaxKind.EqualsEqualsEqualsToken ? equal : !equal);
}

export function evaluateAbstractBinary(
    operator: SyntaxKind,
    left: AbstractValue,
    right: AbstractValue
): AbstractValue | undefined {
    if (operator === SyntaxKind.CommaToken) {
        return right;
    }
    if (operator === SyntaxKind.EqualsEqualsEqualsToken || operator === SyntaxKind.ExclamationEqualsEqualsToken) {
        return strictEqualityResult(operator, left, right);
    }
    return evaluatePrimitiveBinary(operator, left.value, right.value) ?? oversizedBigIntResult(operator, left, right);
}
