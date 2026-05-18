import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bold, green, red, yellow } from 'yoctocolors';
import { getErrorSymbol, getSuccessSymbol, getWarningSymbol } from './runner-symbols.ts';

suite('runner-symbols', function () {
    test('getErrorSymbol returns a bold red mark', function () {
        assert.strictEqual(getErrorSymbol(), bold(red('✖')));
    });

    test('getSuccessSymbol returns a bold green check', function () {
        assert.strictEqual(getSuccessSymbol(), bold(green('✔')));
    });

    test('getWarningSymbol returns a yellow warning sign', function () {
        assert.strictEqual(getWarningSymbol(), yellow('⚠'));
    });
});
