import assert from 'node:assert';
import { suite, test } from 'mocha';
import { INSTRUMENTER_CONSTANTS } from '@stryker-mutator/api/core';
import { literalValue } from './literal-value.ts';
import { multilineValue } from './multiline-value.ts';

suite('filtering', function () {
    test('literal [value]+ (result)? ^$|.*', function () {
        assert.strictEqual(literalValue(), 1);
    });

    test('multiline\nname', function () {
        assert.strictEqual(multilineValue(), 2);
    });

    test('uncovered', function () {
        const context: unknown = Reflect.get(globalThis, INSTRUMENTER_CONSTANTS.NAMESPACE);
        if (context === null || typeof context !== 'object') {
            assert.fail('Missing instrumentation context');
        }
        assert.strictEqual(Reflect.get(context, 'activeMutant'), undefined);
    });
});
