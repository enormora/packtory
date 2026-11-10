import { SyntaxKind, type NumericLiteral } from 'ts-morph';

export type PrimitiveValue = bigint | boolean | number | string | null | undefined;
export type EvaluatedValue = { readonly value: PrimitiveValue; };

export const isTruthy = Boolean;

export function evaluated(value: PrimitiveValue): EvaluatedValue {
    return { value };
}

export function numericLiteralValue(literal: NumericLiteral): number {
    return Number(literal.compilerNode.text);
}

type NumericOperation = (left: number, right: number) => PrimitiveValue;

const maximumStringLength = 4096;
const numericOperations: ReadonlyMap<SyntaxKind, NumericOperation> = new Map<SyntaxKind, NumericOperation>([
    [ SyntaxKind.PlusToken, function (left, right) {
        return left + right;
    } ],
    [ SyntaxKind.MinusToken, function (left, right) {
        return left - right;
    } ],
    [ SyntaxKind.AsteriskToken, function (left, right) {
        return left * right;
    } ],
    [ SyntaxKind.SlashToken, function (left, right) {
        return left / right;
    } ],
    [ SyntaxKind.PercentToken, function (left, right) {
        return left % right;
    } ],
    [ SyntaxKind.LessThanToken, function (left, right) {
        return left < right;
    } ],
    [ SyntaxKind.LessThanEqualsToken, function (left, right) {
        return left <= right;
    } ],
    [ SyntaxKind.GreaterThanToken, function (left, right) {
        return left > right;
    } ],
    [ SyntaxKind.GreaterThanEqualsToken, function (left, right) {
        return left >= right;
    } ]
]);

function stringBinary(operator: SyntaxKind, left: PrimitiveValue, right: PrimitiveValue): EvaluatedValue | undefined {
    if (typeof left !== 'string' || typeof right !== 'string' || operator !== SyntaxKind.PlusToken) {
        return undefined;
    }
    return left.length + right.length <= maximumStringLength ? evaluated(left + right) : undefined;
}

export function evaluatePrimitiveBinary(
    operator: SyntaxKind,
    left: PrimitiveValue,
    right: PrimitiveValue
): EvaluatedValue | undefined {
    if (typeof left === 'number' && typeof right === 'number') {
        const operation = numericOperations.get(operator);
        return operation === undefined ? undefined : evaluated(operation(left, right));
    }
    return stringBinary(operator, left, right);
}

export function shortCircuitValue(operator: SyntaxKind, left: unknown): boolean | undefined {
    if (operator === SyntaxKind.AmpersandAmpersandToken) {
        return !isTruthy(left);
    }
    if (operator === SyntaxKind.BarBarToken) {
        return Boolean(left);
    }
    return operator === SyntaxKind.QuestionQuestionToken ? left !== null && left !== undefined : undefined;
}

function numericNegation(operand: PrimitiveValue): EvaluatedValue {
    return evaluated(typeof operand === 'bigint' ? -operand : -Number(operand));
}

export function evaluatePrimitiveUnary(operator: SyntaxKind, operand: PrimitiveValue): EvaluatedValue | undefined {
    if (operator === SyntaxKind.MinusToken) {
        return numericNegation(operand);
    }
    return typeof operand !== 'bigint' && operator === SyntaxKind.PlusToken ? evaluated(Number(operand)) : undefined;
}
