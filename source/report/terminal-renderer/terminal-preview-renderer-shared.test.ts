import assert from 'node:assert';
import { test } from 'mocha';
import { bold as defaultBoldFormatter } from 'yoctocolors';
import { createColors, renderDiffLine } from './terminal-preview-renderer-shared.ts';

const escapeSequenceStart = String.fromCodePoint(27);

test('renderDiffLine colors add and remove lines and leaves context lines unchanged', () => {
    const colors = createColors(true);

    assert.ok(renderDiffLine({ type: 'add', text: '+ok' }, colors).startsWith(`${escapeSequenceStart}[32m+ok`));
    assert.ok(renderDiffLine({ type: 'remove', text: '-nope' }, colors).startsWith(`${escapeSequenceStart}[31m-nope`));
    assert.strictEqual(renderDiffLine({ type: 'context', text: ' same' }, colors), ' same');
});

test('createColors returns forced ANSI formatters when enabled', () => {
    const colors = createColors(true);

    assert.strictEqual(colors.bold('x'), `${escapeSequenceStart}[1mx${escapeSequenceStart}[22m`);
    assert.strictEqual(colors.yellow('y'), `${escapeSequenceStart}[33my${escapeSequenceStart}[39m`);
    assert.notStrictEqual(colors.bold, defaultBoldFormatter);
});

test('createColors returns identity formatters when disabled', () => {
    const colors = createColors(false);

    assert.strictEqual(colors.bold('x'), 'x');
    assert.strictEqual(colors.yellow('y'), 'y');
    assert.strictEqual(colors.bold, colors.dim);
});

test('createColors defaults to non-forced output when color is undefined in this environment', () => {
    const colors = createColors(undefined);

    assert.strictEqual(colors.bold('x'), defaultBoldFormatter('x'));
    assert.strictEqual(colors.bold, defaultBoldFormatter);
});
