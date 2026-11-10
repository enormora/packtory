import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { evaluateAbstractBinary } from './abstract-value.ts';
import { evaluated } from './primitive-value.ts';

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
