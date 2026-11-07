import assert from 'node:assert';
import { suite, test } from 'mocha';
import { getRequiredValue } from './required-value-helpers.ts';

suite('required-value-helpers', function () {
    test('getRequiredValue returns the value when it is defined', function () {
        assert.strictEqual(getRequiredValue('abc', 'msg'), 'abc');
    });

    test('getRequiredValue throws with the given message when the value is undefined', function () {
        try {
            getRequiredValue(undefined, 'value missing');
            assert.fail('Expected getRequiredValue() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'value missing');
        }
    });
});
