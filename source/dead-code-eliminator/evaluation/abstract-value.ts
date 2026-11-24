import { isTruthy } from 'remeda';
import { SyntaxKind } from 'ts-morph';
import type { ImportedExpressionOrigin } from '../imported-expression-origin.ts';
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

type OpaqueKind = 'array' | 'callable' | 'object' | 'oversized-bigint' | 'primitive' | 'value';

type OpaqueResult = {
    readonly value: { readonly opaque: OpaqueKind; readonly origin: ImportedExpressionOrigin | undefined; };
};

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
    return { value: { opaque: kind, origin: undefined } };
}

export function importedResult(kind: 'callable' | 'object', origin: ImportedExpressionOrigin): OpaqueResult {
    return { value: { opaque: kind, origin } };
}

export function originOf(result: AbstractValue): ImportedExpressionOrigin | undefined {
    return isOpaqueResult(result) ? result.value.origin : undefined;
}

export function isSpreadSafeObjectResult(result: AbstractValue): boolean {
    return isOpaqueResult(result) && result.value.opaque === 'object';
}

export function isOpaqueArrayResult(result: AbstractValue): boolean {
    return isOpaqueResult(result) && result.value.opaque === 'array';
}

function hasUnknownPrimitiveShape(result: AbstractValue): boolean {
    return isOpaqueResult(result) && (result.value.opaque === 'primitive' || result.value.opaque === 'value');
}

function isCoercionSafe(result: AbstractValue): boolean {
    if (isOpaqueResult(result)) {
        return result.value.opaque === 'primitive';
    }
    return isPrimitiveResult(result) && typeof result.value !== 'bigint';
}

export function truthinessOf(result: AbstractValue): boolean | undefined {
    if (hasUnknownPrimitiveShape(result)) {
        return undefined;
    }
    return isOpaqueResult(result) || isTruthy(result.value);
}

export function nullishOf(result: AbstractValue): boolean | undefined {
    if (hasUnknownPrimitiveShape(result)) {
        return undefined;
    }
    return result.value === null || result.value === undefined;
}

export type ShortCircuitSelection = 'either' | 'left' | 'right';

function leftIsSelected(operator: SyntaxKind, left: AbstractValue): boolean | undefined {
    if (operator === SyntaxKind.AmpersandAmpersandToken) {
        const truthy = truthinessOf(left);
        return truthy === undefined ? undefined : !truthy;
    }
    if (operator === SyntaxKind.BarBarToken) {
        return truthinessOf(left);
    }
    const nullish = nullishOf(left);
    return nullish === undefined ? undefined : !nullish;
}

export function shortCircuitSelection(operator: SyntaxKind, left: AbstractValue): ShortCircuitSelection | undefined {
    const shortCircuiting = [
        SyntaxKind.AmpersandAmpersandToken,
        SyntaxKind.BarBarToken,
        SyntaxKind.QuestionQuestionToken
    ]
        .includes(operator);
    if (!shortCircuiting) {
        return undefined;
    }
    const selected = leftIsSelected(operator, left);
    if (selected === undefined) {
        return 'either';
    }
    return selected ? 'left' : 'right';
}

export function eitherResult(left: AbstractValue, right: AbstractValue): AbstractValue {
    return opaqueResult(isCoercionSafe(left) && isCoercionSafe(right) ? 'primitive' : 'value');
}

export function isRecordResult(result: AbstractValue): result is RecordResult {
    return result.value !== null && typeof result.value === 'object' &&
        Object.hasOwn(result.value, 'propertyReference');
}

export function typeOfResult(result: AbstractValue): string | undefined {
    if (!isOpaqueResult(result)) {
        return typeof result.value;
    }
    if (hasUnknownPrimitiveShape(result)) {
        return undefined;
    }
    if (result.value.opaque === 'callable') {
        return 'function';
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

function isCoercingUnaryOperator(operator: SyntaxKind): boolean {
    return [ SyntaxKind.MinusToken, SyntaxKind.PlusToken, SyntaxKind.TildeToken ].includes(operator);
}

function negationResult(operand: AbstractValue): AbstractValue {
    const truthy = truthinessOf(operand);
    return truthy === undefined ? opaqueResult('primitive') : evaluated(!truthy);
}

function opaqueUnaryResult(operator: SyntaxKind, operand: AbstractValue): AbstractValue | undefined {
    return isCoercionSafe(operand) && isCoercingUnaryOperator(operator) ? opaqueResult('primitive') : undefined;
}

export function evaluateAbstractUnary(operator: SyntaxKind, operand: AbstractValue): AbstractValue | undefined {
    if (operator === SyntaxKind.ExclamationToken) {
        return negationResult(operand);
    }
    if (isOpaqueResult(operand)) {
        return opaqueUnaryResult(operator, operand);
    }
    return isPrimitiveResult(operand) ? evaluatePrimitiveUnary(operator, operand.value) : undefined;
}

function strictEqualityResult(
    operator: SyntaxKind,
    left: AbstractValue,
    right: AbstractValue
): AbstractValue {
    const equal = strictlyEqualResults(left, right);
    if (equal === undefined) {
        return opaqueResult('primitive');
    }
    return evaluated(operator === SyntaxKind.EqualsEqualsEqualsToken ? equal : !equal);
}

function isPrimitiveCoercingOperator(operator: SyntaxKind): boolean {
    return [
        SyntaxKind.LessThanToken,
        SyntaxKind.GreaterThanToken,
        SyntaxKind.LessThanEqualsToken,
        SyntaxKind.GreaterThanEqualsToken,
        SyntaxKind.EqualsEqualsToken,
        SyntaxKind.ExclamationEqualsToken,
        SyntaxKind.PlusToken,
        SyntaxKind.MinusToken,
        SyntaxKind.AsteriskToken,
        SyntaxKind.AsteriskAsteriskToken,
        SyntaxKind.SlashToken,
        SyntaxKind.PercentToken,
        SyntaxKind.LessThanLessThanToken,
        SyntaxKind.GreaterThanGreaterThanToken,
        SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
        SyntaxKind.AmpersandToken,
        SyntaxKind.BarToken,
        SyntaxKind.CaretToken
    ]
        .includes(operator);
}

function coercedPrimitiveResult(
    operator: SyntaxKind,
    left: AbstractValue,
    right: AbstractValue
): AbstractValue | undefined {
    return isCoercionSafe(left) && isCoercionSafe(right) && isPrimitiveCoercingOperator(operator)
        ? opaqueResult('primitive')
        : undefined;
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
    return evaluatePrimitiveBinary(operator, left.value, right.value) ??
        oversizedBigIntResult(operator, left, right) ??
        coercedPrimitiveResult(operator, left, right);
}
