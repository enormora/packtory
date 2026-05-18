import assert from 'node:assert';
import { test } from 'mocha';
import { clearEntireLine, cursorToColumnZero, cursorUp, formatLine } from './spinner-glyphs.ts';

const escapeSequence = String.fromCodePoint(27);

test('cursorToColumnZero is the carriage-return sequence', () => {
    assert.strictEqual(cursorToColumnZero, '\r');
});

test('clearEntireLine emits the ANSI clear-line escape sequence', () => {
    assert.strictEqual(clearEntireLine, `${escapeSequence}[2K`);
});

test('cursorUp emits the ANSI cursor-up sequence for the requested number of lines', () => {
    assert.strictEqual(cursorUp(3), `${escapeSequence}[3A`);
});

test('formatLine renders a green check for a succeeded slot', () => {
    const line = formatLine({ state: 'succeeded', label: 'pkg', message: 'done' }, 0, 80);
    assert.ok(line.includes('✔'));
    assert.ok(line.endsWith('pkg: done'));
});

test('formatLine renders a red cross for a failed slot', () => {
    const line = formatLine({ state: 'failed', label: 'pkg', message: 'boom' }, 0, 80);
    assert.ok(line.includes('✖'));
});

test('formatLine renders a red cross for a canceled slot', () => {
    const line = formatLine({ state: 'canceled', label: 'pkg', message: 'aborted' }, 0, 80);
    assert.ok(line.includes('✖'));
});

test('formatLine cycles through spinner frames based on the frame index for a running slot', () => {
    const frames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
    const composed = formatLine({ state: 'running', label: 'pkg', message: 'go' }, 13, 80);
    assert.ok(composed.startsWith(frames.charAt(13 % frames.length)));
});

test('formatLine truncates the rendered line to the given column count', () => {
    const composed = formatLine({ state: 'running', label: 'pkg', message: 'long-message-here' }, 0, 10);
    assert.strictEqual(composed.length, 10);
});

test('formatLine returns the full composed line when columns is zero or negative', () => {
    const composed = formatLine({ state: 'running', label: 'pkg', message: 'x' }, 0, 0);
    assert.ok(composed.endsWith('pkg: x'));
});
