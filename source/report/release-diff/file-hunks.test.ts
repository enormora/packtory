import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PreviewDiffHunk, PreviewDiffLine } from '../preview/preview-document-diff.ts';
import { buildFileHunks } from './file-hunks.ts';

function expectFirstHunk(hunks: readonly PreviewDiffHunk[]): PreviewDiffHunk {
    const [ hunk ] = hunks;
    if (hunk === undefined) {
        assert.fail('expected hunk');
    }
    return hunk;
}

function expectLine(line: PreviewDiffLine | undefined): PreviewDiffLine {
    if (line === undefined) {
        assert.fail('expected line');
    }
    return line;
}

suite('file-hunks', function () {
    test('returns an empty array when previous and new content are identical', function () {
        const hunks = buildFileHunks('src/index.ts', 'one\ntwo\n', 'one\ntwo\n');
        assert.deepStrictEqual(hunks, []);
    });

    test('returns one hunk describing a single-line change', function () {
        const hunks = buildFileHunks('src/index.ts', 'one\n', 'two\n');
        assert.strictEqual(hunks.length, 1);
        const hunk = expectFirstHunk(hunks);
        const addLine = hunk.lines.find(function (line) {
            return line.type === 'add';
        });
        const removeLine = hunk.lines.find(function (line) {
            return line.type === 'remove';
        });
        assert.strictEqual(expectLine(addLine).text, '+two');
        assert.strictEqual(expectLine(removeLine).text, '-one');
    });

    test('strips lines beginning with a backslash (no-newline markers)', function () {
        const hunks = buildFileHunks('src/index.ts', 'one', 'two');
        const allLines = hunks.flatMap(function (hunk) {
            return hunk.lines;
        });
        const hasBackslashMarker = allLines.some(function (line) {
            return line.text.startsWith('\\');
        });
        assert.strictEqual(hasBackslashMarker, false);
    });

    test('produces a header line matching the diff hunk-positions format', function () {
        const hunks = buildFileHunks('src/index.ts', 'one\n', 'two\n');
        const hunk = expectFirstHunk(hunks);
        assert.match(hunk.header, /^@@ -\d+,\d+ \+\d+,\d+ @@$/u);
    });

    test('produces two hunks when changes are 8 lines apart - distinguishing the configured 3-line context from the diff library default', function () {
        const previous = [ 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i' ].join('\n');
        const next = [ 'A', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'I' ].join('\n');

        const hunks = buildFileHunks('lines.txt', previous, next);

        assert.strictEqual(hunks.length, 2);
    });
});
