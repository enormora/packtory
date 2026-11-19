import assert from 'node:assert';
import { setup, suite, suiteSetup, suiteTeardown, teardown, test } from 'mocha';
import { INSTRUMENTER_CONSTANTS } from '@stryker-mutator/api/core';
import { literalValue } from './literal-value.ts';
import { multilineValue } from './multiline-value.ts';

suite('filtering', function () {
    let activeTest = false;

    setup(function () {
        assert.strictEqual(activeTest, false);
        activeTest = true;
    });

    teardown(function () {
        assert.strictEqual(activeTest, true);
        activeTest = false;
    });

    test('literal [value]+ (result)? ^$|.*', function () {
        assert.strictEqual(activeTest, true);
        assert.strictEqual(literalValue(), 1);
    });

    test('repeated literal', function () {
        assert.strictEqual(activeTest, true);
        assert.strictEqual(literalValue(), 1);
    });

    suite('nested', function () {
        let activeSuite = false;

        suiteSetup(function () {
            assert.strictEqual(activeSuite, false);
            activeSuite = true;
        });

        suiteTeardown(function () {
            assert.strictEqual(activeSuite, true);
            activeSuite = false;
        });

        test('multiline\nname', function () {
            assert.strictEqual(activeTest, true);
            assert.strictEqual(activeSuite, true);
            assert.strictEqual(multilineValue(), 2);
        });
    });

    test('uncovered', function () {
        const context: unknown = Reflect.get(globalThis, INSTRUMENTER_CONSTANTS.NAMESPACE);
        if (context === null || typeof context !== 'object') {
            assert.fail('Missing instrumentation context');
        }
        assert.strictEqual(Reflect.get(context, 'activeMutant'), undefined);
    });
});
