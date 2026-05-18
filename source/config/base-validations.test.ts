import assert from 'node:assert';
import { test } from 'mocha';
import { nonEmptyStringSchema } from './base-validations.ts';

test('nonEmptyStringSchema accepts a non-empty string', () => {
    assert.strictEqual(nonEmptyStringSchema.safeParse('hello').success, true);
});

test('nonEmptyStringSchema rejects an empty string', () => {
    assert.strictEqual(nonEmptyStringSchema.safeParse('').success, false);
});

test('nonEmptyStringSchema rejects non-string inputs', () => {
    assert.strictEqual(nonEmptyStringSchema.safeParse(null).success, false);
    assert.strictEqual(nonEmptyStringSchema.safeParse(42).success, false);
});
