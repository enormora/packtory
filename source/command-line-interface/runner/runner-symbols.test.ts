import assert from 'node:assert';
import { test } from 'mocha';
import { bold, green, red, yellow } from 'yoctocolors';
import { getErrorSymbol, getSuccessSymbol, getWarningSymbol } from './runner-symbols.ts';

test('getErrorSymbol returns a bold red mark', () => {
    assert.strictEqual(getErrorSymbol(), bold(red('✖')));
});

test('getSuccessSymbol returns a bold green check', () => {
    assert.strictEqual(getSuccessSymbol(), bold(green('✔')));
});

test('getWarningSymbol returns a yellow warning sign', () => {
    assert.strictEqual(getWarningSymbol(), yellow('⚠'));
});
