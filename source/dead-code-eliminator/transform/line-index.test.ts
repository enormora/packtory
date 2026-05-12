import assert from 'node:assert';
import { test } from 'mocha';
import { buildLineIndex, lineColumnToOffset, offsetToLineColumn } from './line-index.ts';

test('buildLineIndex returns a single entry for an empty string', () => {
    assert.deepStrictEqual(buildLineIndex(''), [{ lineNumber: 1, lineStart: 0 }]);
});

test('buildLineIndex returns one entry per newline-terminated line plus the first line', () => {
    assert.deepStrictEqual(buildLineIndex('a\nb\nc'), [
        { lineNumber: 1, lineStart: 0 },
        { lineNumber: 2, lineStart: 2 },
        { lineNumber: 3, lineStart: 4 }
    ]);
});

test('lineColumnToOffset returns the lineStart plus the column for a known line', () => {
    const index = buildLineIndex('hello\nworld');
    assert.strictEqual(lineColumnToOffset(index, 2, 3), 9);
});

test('lineColumnToOffset returns just the column when the line is past the file', () => {
    const index = buildLineIndex('hello\nworld');
    assert.strictEqual(lineColumnToOffset(index, 99, 4), 4);
});

test('offsetToLineColumn returns line 1 column 0 for offset 0', () => {
    assert.deepStrictEqual(offsetToLineColumn(buildLineIndex('hello\nworld'), 0), { line: 1, column: 0 });
});

test('offsetToLineColumn returns the line containing the offset for a mid-file offset', () => {
    assert.deepStrictEqual(offsetToLineColumn(buildLineIndex('hello\nworld'), 8), { line: 2, column: 2 });
});

test('offsetToLineColumn returns the last line when the offset is past the last newline', () => {
    assert.deepStrictEqual(offsetToLineColumn(buildLineIndex('hello\nworld'), 100), { line: 2, column: 94 });
});

test('offsetToLineColumn returns the initial entry for an empty index', () => {
    assert.deepStrictEqual(offsetToLineColumn([], 7), { line: 1, column: 7 });
});
