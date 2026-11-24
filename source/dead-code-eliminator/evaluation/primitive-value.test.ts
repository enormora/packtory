import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { evaluatePrimitiveBinary, evaluatePrimitiveUnary, shortCircuitValue } from './primitive-value.ts';

suite('primitive values', function () {
    suite('number operator semantics', function () {
        for (
            const [ operator, left, right, expected ] of [
                [ SyntaxKind.AmpersandToken, 7, 3, 3 ],
                [ SyntaxKind.AmpersandToken, Number.NaN, 1, 0 ],
                [ SyntaxKind.BarToken, 4, 3, 7 ],
                [ SyntaxKind.BarToken, 4_294_967_296, 0, 0 ],
                [ SyntaxKind.CaretToken, 7, 3, 4 ],
                [ SyntaxKind.CaretToken, Number.POSITIVE_INFINITY, 1, 1 ],
                [ SyntaxKind.LessThanLessThanToken, 1, 33, 2 ],
                [ SyntaxKind.LessThanLessThanToken, -1, 1, -2 ],
                [ SyntaxKind.LessThanLessThanToken, 1, -1, -2_147_483_648 ],
                [ SyntaxKind.GreaterThanGreaterThanToken, 2_147_483_648, 31, -1 ],
                [ SyntaxKind.GreaterThanGreaterThanToken, -3, 1, -2 ],
                [ SyntaxKind.GreaterThanGreaterThanGreaterThanToken, -1, 0, 4_294_967_295 ],
                [ SyntaxKind.GreaterThanGreaterThanGreaterThanToken, -1, 1, 2_147_483_647 ],
                [ SyntaxKind.GreaterThanGreaterThanGreaterThanToken, -3.9, 0, 4_294_967_293 ],
                [ SyntaxKind.AsteriskAsteriskToken, 2, 4, 16 ],
                [ SyntaxKind.AsteriskAsteriskToken, -2, 3, -8 ],
                [ SyntaxKind.AsteriskAsteriskToken, 2, -1, 0.5 ],
                [ SyntaxKind.AsteriskAsteriskToken, 2, 1024, Number.POSITIVE_INFINITY ],
                [ SyntaxKind.AsteriskAsteriskToken, Number.NaN, 0, 1 ],
                [ SyntaxKind.AsteriskAsteriskToken, -0, 3, -0 ]
            ] as const
        ) {
            test(`evaluates ${String(left)} ${SyntaxKind[operator]} ${String(right)}`, function () {
                assert.deepStrictEqual(evaluatePrimitiveBinary(operator, left, right), { value: expected });
            });
        }

        for (
            const [ value, expected ] of [
                [ -1, 0 ],
                [ 0, -1 ],
                [ 3.9, -4 ],
                [ Number.POSITIVE_INFINITY, -1 ],
                [ Number.NaN, -1 ],
                [ '3.9', -4 ],
                [ true, -2 ],
                [ null, -1 ],
                [ undefined, -1 ]
            ] as const
        ) {
            test(`preserves integer coercion for the complement of ${String(value)}`, function () {
                assert.deepStrictEqual(evaluatePrimitiveUnary(SyntaxKind.TildeToken, value), { value: expected });
            });
        }
    });

    suite('primitive coercion semantics', function () {
        for (
            const [ operator, left, right, expected ] of [
                [ SyntaxKind.PlusToken, null, 1, 1 ],
                [ SyntaxKind.PlusToken, true, 1, 2 ],
                [ SyntaxKind.MinusToken, '2', 1, 1 ],
                [ SyntaxKind.AsteriskToken, false, 42, 0 ],
                [ SyntaxKind.SlashToken, '8', 2, 4 ],
                [ SyntaxKind.PercentToken, '5', 2, 1 ],
                [ SyntaxKind.AmpersandToken, '7', 3, 3 ],
                [ SyntaxKind.GreaterThanGreaterThanGreaterThanToken, undefined, 0, 0 ],
                [ SyntaxKind.PlusToken, undefined, 1, Number.NaN ],
                [ SyntaxKind.GreaterThanToken, 'b', 'a', true ],
                [ SyntaxKind.LessThanToken, '10', '2', true ],
                [ SyntaxKind.LessThanToken, 1, 2n, true ],
                [ SyntaxKind.LessThanToken, 1n, '2', true ],
                [ SyntaxKind.LessThanToken, 9_007_199_254_740_992n, '9007199254740993', true ],
                [ SyntaxKind.LessThanToken, 2n, '2.0', false ],
                [ SyntaxKind.LessThanToken, 1n, 'text', false ],
                [ SyntaxKind.LessThanToken, Number.NaN, 1n, false ],
                [ SyntaxKind.LessThanToken, null, 1, true ],
                [ SyntaxKind.GreaterThanEqualsToken, undefined, 0, false ],
                [ SyntaxKind.LessThanToken, 1n, Number.POSITIVE_INFINITY, true ],
                [ SyntaxKind.EqualsEqualsToken, true, 1, true ],
                [ SyntaxKind.EqualsEqualsToken, '1', 1, true ],
                [ SyntaxKind.EqualsEqualsToken, null, undefined, true ],
                [ SyntaxKind.EqualsEqualsToken, false, '0', true ],
                [ SyntaxKind.EqualsEqualsToken, 0n, false, true ],
                [ SyntaxKind.EqualsEqualsToken, '9007199254740993', 9_007_199_254_740_993n, true ],
                [ SyntaxKind.EqualsEqualsToken, Number.NaN, Number.NaN, false ],
                [ SyntaxKind.EqualsEqualsToken, 0, -0, true ],
                [ SyntaxKind.ExclamationEqualsToken, '1', 2, true ],
                [ SyntaxKind.ExclamationEqualsToken, null, undefined, false ],
                [ SyntaxKind.ExclamationEqualsToken, 2n, '2.0', true ],
                [ SyntaxKind.EqualsEqualsToken, 1n, '1.0', false ],
                [ SyntaxKind.EqualsEqualsToken, true, 1n, true ],
                [ SyntaxKind.EqualsEqualsToken, undefined, 0, false ],
                [ SyntaxKind.EqualsEqualsToken, null, 0, false ],
                [ SyntaxKind.EqualsEqualsToken, ' 2 ', 2n, true ]
            ] as const
        ) {
            const name = `${typeof left}:${String(left)} ${SyntaxKind[operator]} ${typeof right}:${String(right)}`;
            test(name, function () {
                assert.deepStrictEqual(evaluatePrimitiveBinary(operator, left, right), { value: expected });
            });
        }
    });

    suite('bounded BigInt operations', function () {
        for (
            const [ operator, left, right, expected ] of [
                [ SyntaxKind.PlusToken, 40n, 2n, 42n ],
                [ SyntaxKind.MinusToken, 44n, 2n, 42n ],
                [ SyntaxKind.AsteriskToken, 21n, 2n, 42n ],
                [ SyntaxKind.SlashToken, -85n, 2n, -42n ],
                [ SyntaxKind.PercentToken, -85n, 2n, -1n ],
                [ SyntaxKind.LessThanToken, 21n, 42n, true ],
                [ SyntaxKind.LessThanEqualsToken, 42n, 42n, true ],
                [ SyntaxKind.GreaterThanToken, 21n, 42n, false ],
                [ SyntaxKind.GreaterThanToken, 42n, 42n, false ],
                [ SyntaxKind.GreaterThanEqualsToken, 21n, 42n, false ],
                [ SyntaxKind.PlusToken, 42n, 0n, 42n ],
                [ SyntaxKind.AsteriskToken, 42n, 0n, 0n ]
            ] as const
        ) {
            test(`evaluates ${left} ${SyntaxKind[operator]} ${right}`, function () {
                assert.deepStrictEqual(evaluatePrimitiveBinary(operator, left, right), { value: expected });
            });
        }

        for (
            const [ operator, left, right ] of [
                [ SyntaxKind.PlusToken, 21n, 2 ],
                [ SyntaxKind.PlusToken, 21, 2n ],
                [ SyntaxKind.SlashToken, 42n, 0n ],
                [ SyntaxKind.PercentToken, 42n, 0n ],
                [ SyntaxKind.AsteriskAsteriskToken, 2n, 1_000_000n ],
                [ SyntaxKind.PlusToken, 2n ** 4096n, 0n ],
                [ SyntaxKind.PlusToken, 0n, 2n ** 4096n ],
                [ SyntaxKind.PlusToken, -(2n ** 4096n), 0n ],
                [ SyntaxKind.PlusToken, 2n ** 4096n - 1n, 1n ],
                [ SyntaxKind.MinusToken, -(2n ** 4096n) + 1n, 1n ],
                [ SyntaxKind.AsteriskToken, 2n ** 2048n, 2n ** 2048n ],
                [ SyntaxKind.PlusToken, 2n ** 4096n, -(2n ** 4096n) ],
                [ SyntaxKind.AsteriskToken, 2n ** 4096n, 0n ],
                [ SyntaxKind.AsteriskToken, 0n, 2n ** 4096n ]
            ] as const
        ) {
            const expression = `${typeof left}:${String(left)} ${SyntaxKind[operator]} ${typeof right}:${
                String(right)
            }`;
            test(`retains unsupported or unbounded ${expression}`, function () {
                assert.strictEqual(evaluatePrimitiveBinary(operator, left, right), undefined);
            });
        }
    });

    suite('primitive operation boundaries', function () {
        for (
            const [ operator, left, right, expected ] of [
                [ SyntaxKind.PlusToken, 'a', 1, { value: 'a1' } ],
                [ SyntaxKind.PlusToken, 1, 'a', { value: '1a' } ],
                [ SyntaxKind.PlusToken, 'value=', true, { value: 'value=true' } ],
                [ SyntaxKind.PlusToken, 'value=', null, { value: 'value=null' } ],
                [ SyntaxKind.PlusToken, undefined, ' value', { value: 'undefined value' } ],
                [ SyntaxKind.PlusToken, 'x', -0, { value: 'x0' } ],
                [ SyntaxKind.PlusToken, 'x', Number.NaN, { value: 'xNaN' } ],
                [ SyntaxKind.PlusToken, 21n, 'x', { value: '21x' } ],
                [ SyntaxKind.PlusToken, 'x', 21n, { value: 'x21' } ],
                [ SyntaxKind.PlusToken, 'x', 2n ** 4096n, undefined ],
                [ SyntaxKind.PlusToken, 2n ** 4096n, 'x', undefined ],
                [ SyntaxKind.PlusToken, 'x', Symbol('key'), undefined ],
                [ SyntaxKind.MinusToken, 'a', 'b', { value: Number.NaN } ],
                [ SyntaxKind.QuestionToken, 1, 2, undefined ],
                [ SyntaxKind.PlusToken, 'a'.repeat(4095), 'b', { value: `${'a'.repeat(4095)}b` } ],
                [ SyntaxKind.PlusToken, 'a'.repeat(4096), 'b', undefined ]
            ] as const
        ) {
            const name = `bounds ${SyntaxKind[operator]} for ${typeof left}/${typeof right}` +
                ` of length ${String(left).length}`;
            test(name, function () {
                assert.deepStrictEqual(evaluatePrimitiveBinary(operator, left, right), expected);
            });
        }

        for (
            const [ operator, value, expected ] of [
                [ SyntaxKind.QuestionQuestionToken, undefined, false ],
                [ SyntaxKind.QuestionQuestionToken, null, false ],
                [ SyntaxKind.QuestionQuestionToken, 0, true ],
                [ SyntaxKind.QuestionToken, 0, undefined ]
            ] as const
        ) {
            test(`selects the correct operand for ${SyntaxKind[operator]} and ${String(value)}`, function () {
                assert.strictEqual(shortCircuitValue(operator, value), expected);
            });
        }

        test('converts primitive numeric operands without conflating BigInt and Number', function () {
            assert.deepStrictEqual(evaluatePrimitiveUnary(SyntaxKind.PlusToken, '2'), { value: 2 });
            assert.deepStrictEqual(evaluatePrimitiveUnary(SyntaxKind.MinusToken, true), { value: -1 });
            assert.strictEqual(evaluatePrimitiveUnary(SyntaxKind.ExclamationToken, 2), undefined);
            assert.strictEqual(evaluatePrimitiveUnary(SyntaxKind.PlusToken, 2n), undefined);
            assert.strictEqual(evaluatePrimitiveUnary(SyntaxKind.TildeToken, 2n), undefined);
        });

        test('does not inspect or coerce unknown operands during concatenation', function () {
            const unknown = {
                [Symbol.toPrimitive]() {
                    return assert.fail('unknown operands must not be coerced');
                },
                get length() {
                    return assert.fail('unknown operands must not be inspected');
                }
            };
            assert.strictEqual(evaluatePrimitiveBinary(SyntaxKind.PlusToken, unknown, 'text'), undefined);
            assert.strictEqual(evaluatePrimitiveBinary(SyntaxKind.PlusToken, 'text', unknown), undefined);
            for (
                const operator of [
                    SyntaxKind.MinusToken,
                    SyntaxKind.LessThanToken,
                    SyntaxKind.EqualsEqualsToken,
                    SyntaxKind.ExclamationEqualsToken
                ]
            ) {
                assert.strictEqual(evaluatePrimitiveBinary(operator, unknown, 1), undefined);
                assert.strictEqual(evaluatePrimitiveBinary(operator, 1, unknown), undefined);
            }
        });
    });
});
