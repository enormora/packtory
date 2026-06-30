import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildLineIndex, lineColumnToOffset, offsetToLineColumn } from './line-index.ts';

suite('line-index', function () {
    test('buildLineIndex returns a single entry for an empty string', function () {
        assert.deepStrictEqual(buildLineIndex(''), [ { lineNumber: 1, lineStart: 0 } ]);
    });

    test('buildLineIndex returns one entry per newline-terminated line plus the first line', function () {
        assert.deepStrictEqual(buildLineIndex('a\nb\nc'), [
            { lineNumber: 1, lineStart: 0 },
            { lineNumber: 2, lineStart: 2 },
            { lineNumber: 3, lineStart: 4 }
        ]);
    });

    test('lineColumnToOffset returns the lineStart plus the column for a known line', function () {
        const index = buildLineIndex('hello\nworld');
        assert.strictEqual(lineColumnToOffset(index, 2, 3), 9);
    });

    test('lineColumnToOffset returns just the column when the line is past the file', function () {
        const index = buildLineIndex('hello\nworld');
        assert.strictEqual(lineColumnToOffset(index, 99, 4), 4);
    });

    test('offsetToLineColumn returns line 1 column 0 for offset 0', function () {
        assert.deepStrictEqual(offsetToLineColumn(buildLineIndex('hello\nworld'), 0), { line: 1, column: 0 });
    });

    test('offsetToLineColumn returns the line containing the offset for a mid-file offset', function () {
        assert.deepStrictEqual(offsetToLineColumn(buildLineIndex('hello\nworld'), 8), { line: 2, column: 2 });
    });

    test('offsetToLineColumn returns the last line when the offset is past the last newline', function () {
        assert.deepStrictEqual(offsetToLineColumn(buildLineIndex('hello\nworld'), 100), { line: 2, column: 94 });
    });

    test('offsetToLineColumn returns the initial entry for an empty index', function () {
        assert.deepStrictEqual(offsetToLineColumn([], 7), { line: 1, column: 7 });
    });
});
