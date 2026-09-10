import { SyntaxKind } from 'ts-morph';

type ConstantArray = { readonly items: readonly ConstantValue[]; readonly type: 'array'; };
type ConstantBigInt = { readonly type: 'bigint'; readonly value: bigint; };
type ConstantBoolean = { readonly type: 'boolean'; readonly value: boolean; };
type ConstantNull = { readonly type: 'null'; };
type ConstantNumber = { readonly type: 'number'; readonly value: number; };
type ConstantObject = { readonly properties: ReadonlyMap<string, ConstantValue>; readonly type: 'object'; };
type ConstantString = { readonly type: 'string'; readonly value: string; };
type ConstantSymbol = { readonly type: 'symbol'; };
type ConstantUndefined = { readonly type: 'undefined'; };
export type PrimitiveRaw = bigint | boolean | number | string | null | undefined;
type ConstantRawPrimitive = ConstantBigInt | ConstantBoolean | ConstantNumber | ConstantString;
type RawPair = {
    readonly left: PrimitiveRaw;
    readonly right: PrimitiveRaw;
};
type ComparablePair = {
    readonly left: bigint | number | string;
    readonly right: bigint | number | string;
};

const bigintOne = 1n;
const bigintZero = 0n;

export type ConstantPrimitive = ConstantNull | ConstantRawPrimitive | ConstantUndefined;
export type ConstantPropertyKey = ConstantString | ConstantSymbol;
export type ConstantValue = ConstantArray | ConstantObject | ConstantPrimitive | ConstantSymbol;

export function stringConstant(value: string): ConstantString {
    return { type: 'string', value };
}

export function numberConstant(value: number): ConstantNumber {
    return { type: 'number', value };
}

export function bigintConstant(value: bigint): ConstantBigInt {
    return { type: 'bigint', value };
}

export function booleanConstant(value: boolean): ConstantBoolean {
    return { type: 'boolean', value };
}

export function nullConstant(): ConstantNull {
    return { type: 'null' };
}

export function undefinedConstant(): ConstantUndefined {
    return { type: 'undefined' };
}

export function symbolConstant(): ConstantSymbol {
    return { type: 'symbol' };
}

export function arrayConstant(items: readonly ConstantValue[]): ConstantArray {
    return { type: 'array', items };
}

export function objectConstant(properties: ReadonlyMap<string, ConstantValue>): ConstantObject {
    return { type: 'object', properties };
}

function primitiveValue(value: ConstantValue): PrimitiveRaw {
    if (value.type === 'bigint') {
        return value.value;
    }
    if (value.type === 'boolean') {
        return value.value;
    }
    if (value.type === 'number') {
        return value.value;
    }
    if (value.type === 'string') {
        return value.value;
    }
    return undefined;
}

export function primitiveRawValue(value: ConstantValue): PrimitiveRaw {
    if (value.type === 'null') {
        return null;
    }
    if (value.type === 'undefined') {
        return undefined;
    }
    return primitiveValue(value);
}

function valueFromRaw(raw: PrimitiveRaw): ConstantPrimitive {
    if (typeof raw === 'bigint') {
        return bigintConstant(raw);
    }
    if (typeof raw === 'boolean') {
        return booleanConstant(raw);
    }
    if (typeof raw === 'number') {
        return numberConstant(raw);
    }
    if (typeof raw === 'string') {
        return stringConstant(raw);
    }
    return raw === null ? nullConstant() : undefinedConstant();
}

export function isDataPrimitive(value: ConstantValue): value is ConstantPrimitive {
    return value.type !== 'array' && value.type !== 'object' && value.type !== 'symbol';
}

export function propertyKeyFromConstant(value: ConstantValue): ConstantPropertyKey | undefined {
    if (value.type === 'symbol') {
        return value;
    }
    return isDataPrimitive(value) ? stringConstant(String(primitiveRawValue(value))) : undefined;
}

export function propertyValue(value: ConstantValue, propertyKey: string): ConstantValue | undefined {
    if (value.type === 'object') {
        return value.properties.get(propertyKey);
    }
    if (value.type !== 'array') {
        return undefined;
    }
    const index = Number(propertyKey);
    return Number.isSafeInteger(index) && index >= 0 ? value.items[index] : undefined;
}

function bitwiseNotValue(raw: PrimitiveRaw): ConstantPrimitive {
    if (typeof raw === 'bigint') {
        return valueFromRaw(-raw - bigintOne);
    }
    const [ int32 ] = new Int32Array([ Number(raw) ]);
    return valueFromRaw(-Number(int32) - 1);
}

function minusValue(raw: PrimitiveRaw): ConstantPrimitive {
    return valueFromRaw(typeof raw === 'bigint' ? -raw : -Number(raw));
}

function plusValue(raw: PrimitiveRaw): ConstantPrimitive | undefined {
    return typeof raw === 'bigint' ? undefined : valueFromRaw(Number(raw));
}

function bitwiseOperatorValue(operator: SyntaxKind, raw: PrimitiveRaw): ConstantPrimitive | undefined {
    return operator === SyntaxKind.TildeToken ? bitwiseNotValue(raw) : undefined;
}

function stringOrBooleanIsFalsy(raw: boolean | string): boolean {
    return typeof raw === 'string' ? raw.length === 0 : !raw;
}

function nonNullishRawIsFalsy(raw: Exclude<PrimitiveRaw, null | undefined>): boolean {
    if (typeof raw === 'number') {
        return raw === 0 || Number.isNaN(raw);
    }
    if (typeof raw === 'bigint') {
        return raw === bigintZero;
    }
    return stringOrBooleanIsFalsy(raw);
}

export function rawIsFalsy(raw: PrimitiveRaw): boolean {
    if (raw === undefined || raw === null) {
        return true;
    }
    return nonNullishRawIsFalsy(raw);
}

function unaryValueFromRaw(operator: SyntaxKind, raw: PrimitiveRaw): ConstantPrimitive | undefined {
    if (operator === SyntaxKind.MinusToken) {
        return minusValue(raw);
    }
    if (operator === SyntaxKind.PlusToken) {
        return plusValue(raw);
    }
    return operator === SyntaxKind.ExclamationToken
        ? booleanConstant(rawIsFalsy(raw))
        : bitwiseOperatorValue(operator, raw);
}

export function unaryConstantValue(operator: SyntaxKind, value: ConstantPrimitive): ConstantPrimitive | undefined {
    try {
        return unaryValueFromRaw(operator, primitiveRawValue(value));
    } catch {
        return undefined;
    }
}

function plusNonBigintRaw(left: Exclude<PrimitiveRaw, bigint>, right: Exclude<PrimitiveRaw, bigint>): PrimitiveRaw {
    return typeof left === 'string' || typeof right === 'string'
        ? String(left) + String(right)
        : Number(left) + Number(right);
}

function plusRaw(pair: RawPair): PrimitiveRaw {
    const { left, right } = pair;
    if (typeof left === 'bigint' && typeof right === 'bigint') {
        return left + right;
    }
    if (typeof left === 'bigint' || typeof right === 'bigint') {
        return undefined;
    }
    return plusNonBigintRaw(left, right);
}

function numericRaw(pair: RawPair, combine: (left: number, right: number) => number): PrimitiveRaw {
    if (typeof pair.left === 'bigint' || typeof pair.right === 'bigint') {
        return undefined;
    }
    return combine(Number(pair.left), Number(pair.right));
}

function rawPairIncludesBigint(pair: RawPair): boolean {
    return typeof pair.left === 'bigint' || typeof pair.right === 'bigint';
}

function bigintComparablePair(pair: RawPair): ComparablePair | undefined {
    return typeof pair.left === 'bigint' && typeof pair.right === 'bigint'
        ? { left: pair.left, right: pair.right }
        : undefined;
}

function stringComparablePair(pair: RawPair): ComparablePair | undefined {
    if (typeof pair.left === 'string' && typeof pair.right === 'string') {
        return { left: pair.left, right: pair.right };
    }
    return undefined;
}

function comparablePair(pair: RawPair): ComparablePair | undefined {
    const bigintPair = bigintComparablePair(pair);
    if (bigintPair !== undefined || rawPairIncludesBigint(pair)) {
        return bigintPair;
    }
    const stringPair = stringComparablePair(pair);
    return stringPair ?? { left: Number(pair.left), right: Number(pair.right) };
}

function compareRaw(
    pair: RawPair,
    compare: (left: ComparablePair['left'], right: ComparablePair['right']) => boolean
): PrimitiveRaw {
    const comparable = comparablePair(pair);
    return comparable === undefined ? undefined : compare(comparable.left, comparable.right);
}

function lessThanRaw(pair: RawPair): PrimitiveRaw {
    return compareRaw(pair, function (left, right) {
        return left < right;
    });
}

function greaterThanRaw(pair: RawPair): PrimitiveRaw {
    return compareRaw(pair, function (left, right) {
        return left > right;
    });
}

function lessThanOrEqualRaw(pair: RawPair): PrimitiveRaw {
    return compareRaw(pair, function (left, right) {
        return left <= right;
    });
}

function greaterThanOrEqualRaw(pair: RawPair): PrimitiveRaw {
    return compareRaw(pair, function (left, right) {
        return left >= right;
    });
}

function equalityRaw(pair: RawPair, expectedEqual: boolean): PrimitiveRaw {
    return pair.left === pair.right === expectedEqual;
}

function arithmeticRaw(operator: SyntaxKind, pair: RawPair): PrimitiveRaw {
    if (operator === SyntaxKind.MinusToken) {
        return numericRaw(pair, function (left, right) {
            return left - right;
        });
    }
    if (operator === SyntaxKind.AsteriskToken) {
        return numericRaw(pair, function (left, right) {
            return left * right;
        });
    }
    if (operator === SyntaxKind.SlashToken) {
        return numericRaw(pair, function (left, right) {
            return left / right;
        });
    }
    return undefined;
}

function remainderOrExponentRaw(operator: SyntaxKind, pair: RawPair): PrimitiveRaw {
    if (operator === SyntaxKind.PercentToken) {
        return numericRaw(pair, function (left, right) {
            return left % right;
        });
    }
    if (operator === SyntaxKind.AsteriskAsteriskToken) {
        return numericRaw(pair, function (left, right) {
            return left ** right;
        });
    }
    return undefined;
}

function comparisonRaw(operator: SyntaxKind, pair: RawPair): PrimitiveRaw {
    if (operator === SyntaxKind.LessThanToken) {
        return lessThanRaw(pair);
    }
    if (operator === SyntaxKind.GreaterThanToken) {
        return greaterThanRaw(pair);
    }
    if (operator === SyntaxKind.LessThanEqualsToken) {
        return lessThanOrEqualRaw(pair);
    }
    return operator === SyntaxKind.GreaterThanEqualsToken ? greaterThanOrEqualRaw(pair) : undefined;
}

function rawValueFor(operator: SyntaxKind, pair: RawPair): PrimitiveRaw {
    if (operator === SyntaxKind.PlusToken) {
        return plusRaw(pair);
    }
    if (operator === SyntaxKind.EqualsEqualsEqualsToken) {
        return equalityRaw(pair, true);
    }
    if (operator === SyntaxKind.ExclamationEqualsEqualsToken) {
        return equalityRaw(pair, false);
    }
    return arithmeticRaw(operator, pair) ?? remainderOrExponentRaw(operator, pair) ?? comparisonRaw(operator, pair);
}

function rawValueHandlingErrors(operator: SyntaxKind, pair: RawPair): PrimitiveRaw {
    try {
        return rawValueFor(operator, pair);
    } catch {
        return undefined;
    }
}

export function binaryConstantValue(
    operator: SyntaxKind,
    left: ConstantPrimitive,
    right: ConstantPrimitive
): ConstantPrimitive | undefined {
    const pair = {
        left: primitiveRawValue(left),
        right: primitiveRawValue(right)
    };
    const result = rawValueHandlingErrors(operator, pair);
    return result === undefined ? undefined : valueFromRaw(result);
}
