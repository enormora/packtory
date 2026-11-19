import assert from 'node:assert';
import { suite, test } from 'mocha';
import { INSTRUMENTER_CONSTANTS } from '@stryker-mutator/api/core';

const context: unknown = Reflect.get(globalThis, INSTRUMENTER_CONSTANTS.NAMESPACE);
assert.ok(context !== null && typeof context === 'object');
assert.strictEqual(Reflect.get(context, 'activeMutant'), undefined);

suite('unrelated static filtering', function () {
    test('remains in the baseline', function () {
        assert.strictEqual(Reflect.get(context, 'activeMutant'), undefined);
    });
});
