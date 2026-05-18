import assert from 'node:assert';
import { suite, test } from 'mocha';
import { nonEmptyStringSchema } from './base-validations.ts';

suite('base-validations', function () {
    test('nonEmptyStringSchema accepts a non-empty string', function () {
        assert.strictEqual(nonEmptyStringSchema.safeParse('hello').success, true);
    });

    test('nonEmptyStringSchema rejects an empty string', function () {
        assert.strictEqual(nonEmptyStringSchema.safeParse('').success, false);
    });

    test('nonEmptyStringSchema rejects non-string inputs', function () {
        assert.strictEqual(nonEmptyStringSchema.safeParse(null).success, false);
        assert.strictEqual(nonEmptyStringSchema.safeParse(42).success, false);
    });
});
