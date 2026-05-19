import assert from 'node:assert';
import { suite, test } from 'mocha';
import { compareValues } from './sort-values.ts';

suite('sort-values', function () {
    test('compareValues() sorts strings ascending and keeps equal strings stable', function () {
        assert.strictEqual(compareValues('a', 'b'), -1);
        assert.strictEqual(compareValues('b', 'a'), 1);
        assert.strictEqual(compareValues('a', 'a'), 0);
    });

    test('compareValues() sorts numbers ascending and keeps equal numbers stable', function () {
        assert.strictEqual(compareValues(1, 2), -1);
        assert.strictEqual(compareValues(2, 1), 1);
        assert.strictEqual(compareValues(2, 2), 0);
    });

    test('compareValues() sorts booleans with false before true', function () {
        assert.strictEqual(compareValues(false, true), -1);
        assert.strictEqual(compareValues(true, false), 1);
        assert.strictEqual(compareValues(true, true), 0);
    });

    test('compareValues() keeps mixed primitive types and non-primitives in their relative order', function () {
        assert.strictEqual(compareValues('a', 1), 0);
        assert.strictEqual(compareValues(false, 1), -1);
        assert.strictEqual(compareValues([], 1), 0);
        assert.strictEqual(compareValues(1, []), 0);
        assert.strictEqual(compareValues({}, []), 0);
    });
});
