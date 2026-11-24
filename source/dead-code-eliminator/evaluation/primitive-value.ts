import { match, P } from 'ts-pattern';
import { constant, isString } from 'remeda';
import { SyntaxKind, type NumericLiteral } from 'ts-morph';

export type PrimitiveValue = bigint | boolean | number | string | null | undefined;
export type EvaluatedValue = { readonly value: PrimitiveValue; };

export function evaluated(value: PrimitiveValue): EvaluatedValue {
    return { value };
}

export function numericLiteralValue(literal: NumericLiteral): number {
    return Number(literal.compilerNode.text);
}

const maximumStringLength = 4096;
function numericArithmetic(operator: SyntaxKind, left: number, right: number): number | undefined {
    return match<number>(operator)
        .with(SyntaxKind.PlusToken, function () {
            return left + right;
        })
        .with(SyntaxKind.MinusToken, function () {
            return left - right;
        })
        .with(SyntaxKind.AsteriskToken, function () {
            return left * right;
        })
        .with(SyntaxKind.SlashToken, function () {
            return left / right;
        })
        .with(SyntaxKind.PercentToken, function () {
            return left % right;
        })
        .with(SyntaxKind.AsteriskAsteriskToken, function () {
            return left ** right;
        })
        .otherwise(constant(undefined));
}

/* eslint-disable no-bitwise -- Numeric evaluation requires JavaScript's exact integer coercion and shift semantics. */
function numericBitwise(operator: SyntaxKind, left: number, right: number): number | undefined {
    return match<number>(operator)
        .with(SyntaxKind.AmpersandToken, function () {
            return left & right;
        })
        .with(SyntaxKind.BarToken, function () {
            return left | right;
        })
        .with(SyntaxKind.CaretToken, function () {
            return left ^ right;
        })
        .with(SyntaxKind.LessThanLessThanToken, function () {
            return left << right;
        })
        .with(SyntaxKind.GreaterThanGreaterThanToken, function () {
            return left >> right;
        })
        .with(SyntaxKind.GreaterThanGreaterThanGreaterThanToken, function () {
            return left >>> right;
        })
        .otherwise(constant(undefined));
}
/* eslint-enable no-bitwise -- Integer operator implementations end here. */

function relationalComparison<Value>(
    operator: SyntaxKind,
    left: Value,
    right: Value
): boolean | undefined {
    return match<number>(operator)
        .with(SyntaxKind.LessThanToken, function () {
            return left < right;
        })
        .with(SyntaxKind.LessThanEqualsToken, function () {
            return left <= right;
        })
        .with(SyntaxKind.GreaterThanToken, function () {
            return left > right;
        })
        .with(SyntaxKind.GreaterThanEqualsToken, function () {
            return left >= right;
        })
        .otherwise(constant(undefined));
}

const bigintBase = 2n;
const maximumBigIntBits = 4096n;
const engineSafeBigIntBits = 1_048_576n;
const bigintZero = 0n;
const maximumBigIntMagnitude = bigintBase ** maximumBigIntBits;

const binaryRadix = 2;

function bigintBitLength(value: bigint): bigint {
    const magnitude = value < bigintZero ? -value : value;
    return magnitude === bigintZero ? bigintZero : BigInt(magnitude.toString(binaryRadix).length);
}

function exponentiationBits(base: bigint, exponent: bigint): bigint {
    return bigintBitLength(base) * exponent;
}

function boundedBigInt(value: bigint): EvaluatedValue | undefined {
    return value > -maximumBigIntMagnitude && value < maximumBigIntMagnitude ? evaluated(value) : undefined;
}

function guardedBigIntOperations(left: bigint, right: bigint): readonly (readonly [SyntaxKind, () => bigint])[] {
    const exponentiation = right >= bigintZero && exponentiationBits(left, right) <= maximumBigIntBits
        ? [
            [ SyntaxKind.AsteriskAsteriskToken, function () {
                return left ** right;
            } ] as const
        ]
        : [];
    const division = right === bigintZero
        ? []
        : [
            [ SyntaxKind.SlashToken, function () {
                return left / right;
            } ] as const,
            [ SyntaxKind.PercentToken, function () {
                return left % right;
            } ] as const
        ];
    return [ ...exponentiation, ...division ];
}

function bigintArithmetic(operator: SyntaxKind, left: bigint, right: bigint): EvaluatedValue | undefined {
    if (boundedBigInt(left) === undefined || boundedBigInt(right) === undefined) {
        return undefined;
    }
    const operations = new Map<SyntaxKind, () => bigint>([
        [ SyntaxKind.PlusToken, function () {
            return left + right;
        } ],
        [ SyntaxKind.MinusToken, function () {
            return left - right;
        } ],
        [ SyntaxKind.AsteriskToken, function () {
            return left * right;
        } ],
        ...guardedBigIntOperations(left, right)
    ]);
    const operation = operations.get(operator);
    return operation === undefined ? undefined : boundedBigInt(operation());
}

function numberBinary(operator: SyntaxKind, left: number, right: number): EvaluatedValue | undefined {
    const value = numericArithmetic(operator, left, right) ?? numericBitwise(operator, left, right);
    return value === undefined ? undefined : evaluated(value);
}

function primitiveOperand(value: unknown): EvaluatedValue | undefined {
    return match(value)
        .with(P.union(P.bigint, P.boolean, P.number, P.string, null, undefined), evaluated)
        .otherwise(constant(undefined));
}

function primitiveText(value: PrimitiveValue): string | undefined {
    return typeof value === 'bigint' && boundedBigInt(value) === undefined ? undefined : String(value);
}

function concatenatePrimitives(left: PrimitiveValue, right: PrimitiveValue): EvaluatedValue | undefined {
    const leftText = primitiveText(left);
    const rightText = primitiveText(right);
    if (leftText === undefined || rightText === undefined) {
        return undefined;
    }
    return leftText.length + rightText.length <= maximumStringLength ? evaluated(leftText + rightText) : undefined;
}

function primitiveEquality(
    operator: SyntaxKind,
    left: PrimitiveValue,
    right: PrimitiveValue
): EvaluatedValue | undefined {
    if (operator !== SyntaxKind.EqualsEqualsToken && operator !== SyntaxKind.ExclamationEqualsToken) {
        return undefined;
    }
    // eslint-disable-next-line eqeqeq -- Evaluate JavaScript's coercive equality only after validating primitive operands.
    const equal = left == right;
    return evaluated(operator === SyntaxKind.EqualsEqualsToken ? equal : !equal);
}

function numericOperand(operand: PrimitiveValue): bigint | number {
    return typeof operand === 'bigint' ? operand : Number(operand);
}

function numericBinary(
    operator: SyntaxKind,
    left: bigint | number,
    right: bigint | number
): EvaluatedValue | undefined {
    if (typeof left === 'bigint' && typeof right === 'bigint') {
        return bigintArithmetic(operator, left, right);
    }
    return typeof left === 'number' && typeof right === 'number' ? numberBinary(operator, left, right) : undefined;
}

function knownPrimitiveBinary(
    operator: SyntaxKind,
    left: PrimitiveValue,
    right: PrimitiveValue
): EvaluatedValue | undefined {
    const equality = primitiveEquality(operator, left, right);
    if (equality !== undefined) {
        return equality;
    }
    if (operator === SyntaxKind.PlusToken && [ left, right ].some(isString)) {
        return concatenatePrimitives(left, right);
    }
    const comparison = relationalComparison(operator, left, right);
    return comparison === undefined
        ? numericBinary(operator, numericOperand(left), numericOperand(right))
        : evaluated(comparison);
}

export function evaluatePrimitiveBinary(
    operator: SyntaxKind,
    left: unknown,
    right: unknown
): EvaluatedValue | undefined {
    const first = primitiveOperand(left);
    const second = primitiveOperand(right);
    if (first === undefined || second === undefined) {
        return undefined;
    }
    return knownPrimitiveBinary(operator, first.value, second.value);
}

function isOverflowingBigIntOperator(operator: SyntaxKind): boolean {
    return [ SyntaxKind.PlusToken, SyntaxKind.MinusToken, SyntaxKind.AsteriskToken ].includes(operator);
}

function exponentiationOverflowIsEffectFree(base: bigint, exponent: bigint): boolean {
    return base !== bigintZero && exponent >= bigintZero && exponentiationBits(base, exponent) <= engineSafeBigIntBits;
}

export function bigintOverflowIsNonzeroAndEffectFree(operator: SyntaxKind, left: unknown, right: unknown): boolean {
    if (
        typeof left !== 'bigint' || typeof right !== 'bigint' ||
        boundedBigInt(left) === undefined || boundedBigInt(right) === undefined
    ) {
        return false;
    }
    return operator === SyntaxKind.AsteriskAsteriskToken
        ? exponentiationOverflowIsEffectFree(left, right)
        : isOverflowingBigIntOperator(operator);
}

export function evaluatePrimitiveUnary(operator: SyntaxKind, operand: PrimitiveValue): EvaluatedValue | undefined {
    const value = numericOperand(operand);
    if (operator === SyntaxKind.MinusToken) {
        return evaluated(-value);
    }
    if (typeof value === 'number' && operator === SyntaxKind.TildeToken) {
        // eslint-disable-next-line no-bitwise -- Preserve JavaScript's integer coercion for a known numeric operand.
        return evaluated(~value);
    }
    return typeof value === 'number' && operator === SyntaxKind.PlusToken ? evaluated(value) : undefined;
}
