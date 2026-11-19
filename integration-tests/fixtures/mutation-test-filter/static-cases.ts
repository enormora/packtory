import assert from 'node:assert';
import { suite, test } from 'mocha';
import { value } from './static-forward.ts';

suite('static filtering', function () {
    test('observes a reexported value', function () {
        assert.strictEqual(value, 'expected');
    });
});
