import assert from 'node:assert';
import { suite, test } from 'mocha';
import { getRequiredArrayValue, getRequiredValue, mapRequiredArrayValue } from './required-value-helpers.ts';

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

    test('getRequiredArrayValue returns the array unchanged when it has at least one element', function () {
        assert.deepStrictEqual(getRequiredArrayValue(['a', 'b'], 'msg'), ['a', 'b']);
    });

    test('getRequiredArrayValue throws with the given message when the array is empty', function () {
        try {
            getRequiredArrayValue([], 'array required');
            assert.fail('Expected getRequiredArrayValue() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'array required');
        }
    });

    test('mapRequiredArrayValue maps every element with the supplied mapper while preserving the non-empty signature', function () {
        assert.deepStrictEqual(
            mapRequiredArrayValue([1, 2, 3], (value) => value * 2),
            [2, 4, 6]
        );
    });
});
