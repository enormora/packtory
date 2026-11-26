import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import {
    evaluateAbstractBinary,
    isPrimitiveResult,
    isRecordResult,
    opaqueResult,
    shortCircuitSelection,
    typeOfResult,
    type AbstractValue
} from './abstract-value.ts';
import { evaluated } from './primitive-value.ts';

suite('abstract values', function () {
    suite('abstract binary values', function () {
        for (const operator of [ SyntaxKind.PlusToken, SyntaxKind.EqualsEqualsToken ]) {
            test(`does not coerce records for ${SyntaxKind[operator]}`, function () {
                const record = {
                    value: {
                        propertyReference() {
                            throw new Error('unexpected record coercion');
                        }
                    }
                };
                const primitive = evaluated(1);
                assert.strictEqual(evaluateAbstractBinary(operator, record, primitive), undefined);
                assert.strictEqual(evaluateAbstractBinary(operator, primitive, record), undefined);
            });
        }
    });

    suite('short-circuit selection', function () {
        for (
            const [ operator, value, expected ] of [
                [ SyntaxKind.QuestionQuestionToken, evaluated(undefined), 'right' ],
                [ SyntaxKind.QuestionQuestionToken, evaluated(null), 'right' ],
                [ SyntaxKind.QuestionQuestionToken, evaluated(0), 'left' ],
                [ SyntaxKind.QuestionQuestionToken, opaqueResult('value'), 'either' ],
                [ SyntaxKind.QuestionQuestionToken, opaqueResult('array'), 'left' ],
                [ SyntaxKind.AmpersandAmpersandToken, opaqueResult('primitive'), 'either' ],
                [ SyntaxKind.BarBarToken, opaqueResult('array'), 'left' ],
                [ SyntaxKind.QuestionToken, evaluated(0), undefined ]
            ] as const
        ) {
            test(`selects the ${String(expected)} operand for ${SyntaxKind[operator]}`, function () {
                assert.strictEqual(shortCircuitSelection(operator, value), expected);
            });
        }
    });

    suite('opaque array values', function () {
        test('reports an array of unknown contents as an object that is neither primitive nor record', function () {
            const array = opaqueResult('array');

            assert.strictEqual(typeOfResult(array), 'object');
            assert.strictEqual(isPrimitiveResult(array), false);
            assert.strictEqual(isRecordResult(array), false);
            assert.deepStrictEqual(
                evaluateAbstractBinary(SyntaxKind.EqualsEqualsEqualsToken, array, array),
                opaqueResult('primitive')
            );
        });
    });

    suite('oversized bigint values', function () {
        function exponentiation(base: bigint, exponent: bigint): AbstractValue | undefined {
            return evaluateAbstractBinary(SyntaxKind.AsteriskAsteriskToken, evaluated(base), evaluated(exponent));
        }

        test('keeps an exponentiation beyond the evaluation bound as a bigint of unknown value', function () {
            const oversized = exponentiation(2n, 4096n);
            assertDefined(oversized);

            assert.strictEqual(typeOfResult(oversized), 'bigint');
            assert.strictEqual(isPrimitiveResult(oversized), false);
            assert.strictEqual(isRecordResult(oversized), false);
        });

        test('keeps a negative base beyond the evaluation bound as an oversized bigint', function () {
            const oversized = exponentiation(-2n, 4097n);
            assertDefined(oversized);

            assert.strictEqual(typeOfResult(oversized), 'bigint');
        });

        test('computes small exponentiations exactly', function () {
            assert.deepStrictEqual(exponentiation(2n, 10n), evaluated(1024n));
            assert.deepStrictEqual(exponentiation(0n, 5000n), evaluated(0n));
        });

        for (const [ base, exponent ] of [ [ 2n, -1n ], [ 0n, -1n ], [ 2n, 2_000_000n ] ] as const) {
            test(`rejects ${base}n ** ${exponent}n because it may throw`, function () {
                assert.strictEqual(exponentiation(base, exponent), undefined);
            });
        }

        for (const operator of [ SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken ]) {
            test(`keeps ${SyntaxKind[operator]} of oversized bigints as an unknown boolean`, function () {
                const oversized = exponentiation(2n, 4096n);
                assertDefined(oversized);

                assert.deepStrictEqual(
                    evaluateAbstractBinary(operator, oversized, oversized),
                    opaqueResult('primitive')
                );
                assert.deepStrictEqual(
                    evaluateAbstractBinary(operator, evaluated(1n), oversized),
                    opaqueResult('primitive')
                );
            });
        }

        test('does not combine an oversized bigint with further arithmetic', function () {
            const oversized = exponentiation(2n, 4096n);
            assertDefined(oversized);

            assert.strictEqual(evaluateAbstractBinary(SyntaxKind.PlusToken, oversized, evaluated(1n)), undefined);
        });
    });
});
