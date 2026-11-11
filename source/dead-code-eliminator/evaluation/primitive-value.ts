import { match } from 'ts-pattern';
import { constant, isTruthy } from 'remeda';
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
        .otherwise(constant(undefined));
}

function numericComparison(operator: SyntaxKind, left: number, right: number): boolean | undefined {
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

function stringBinary(operator: SyntaxKind, left: unknown, right: unknown): EvaluatedValue | undefined {
    if (typeof left !== 'string' || typeof right !== 'string' || operator !== SyntaxKind.PlusToken) {
        return undefined;
    }
    return left.length + right.length <= maximumStringLength ? evaluated(left + right) : undefined;
}

export function evaluatePrimitiveBinary(
    operator: SyntaxKind,
    left: unknown,
    right: unknown
): EvaluatedValue | undefined {
    if (typeof left === 'number' && typeof right === 'number') {
        const value = numericArithmetic(operator, left, right) ?? numericComparison(operator, left, right);
        return value === undefined ? undefined : evaluated(value);
    }
    return stringBinary(operator, left, right);
}

export function shortCircuitValue(operator: SyntaxKind | undefined, left: unknown): boolean | undefined {
    if (operator === SyntaxKind.AmpersandAmpersandToken) {
        return !isTruthy(left);
    }
    if (operator === SyntaxKind.BarBarToken) {
        return Boolean(left);
    }
    return operator === SyntaxKind.QuestionQuestionToken ? left !== null && left !== undefined : undefined;
}

function numericOperand(operand: PrimitiveValue): bigint | number {
    return typeof operand === 'bigint' ? operand : Number(operand);
}

export function evaluatePrimitiveUnary(operator: SyntaxKind, operand: PrimitiveValue): EvaluatedValue | undefined {
    const value = numericOperand(operand);
    if (operator === SyntaxKind.MinusToken) {
        return evaluated(-value);
    }
    return typeof value === 'number' && operator === SyntaxKind.PlusToken ? evaluated(value) : undefined;
}
