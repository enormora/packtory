import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildFileHunks } from './file-hunks.ts';

suite('file-hunks', function () {
    test('returns an empty array when previous and new content are identical', function () {
        const hunks = buildFileHunks('src/index.ts', 'one\ntwo\n', 'one\ntwo\n');
        assert.deepStrictEqual(hunks, []);
    });

    test('returns one hunk describing a single-line change', function () {
        const hunks = buildFileHunks('src/index.ts', 'one\n', 'two\n');
        assert.strictEqual(hunks.length, 1);
        const [hunk] = hunks;
        assert.ok(hunk);
        const addLine = hunk.lines.find((line) => {
            return line.type === 'add';
        });
        const removeLine = hunk.lines.find((line) => {
            return line.type === 'remove';
        });
        assert.ok(addLine);
        assert.ok(removeLine);
        assert.strictEqual(addLine.text, '+two');
        assert.strictEqual(removeLine.text, '-one');
    });

    test('strips lines beginning with a backslash (no-newline markers)', function () {
        const hunks = buildFileHunks('src/index.ts', 'one', 'two');
        const allLines = hunks.flatMap((hunk) => {
            return hunk.lines;
        });
        const hasBackslashMarker = allLines.some((line) => {
            return line.text.startsWith('\\');
        });
        assert.strictEqual(hasBackslashMarker, false);
    });

    test('produces a header line matching the diff hunk-positions format', function () {
        const hunks = buildFileHunks('src/index.ts', 'one\n', 'two\n');
        const [hunk] = hunks;
        assert.ok(hunk);
        assert.match(hunk.header, /^@@ -\d+,\d+ \+\d+,\d+ @@$/u);
    });

    test('produces multiple hunks when the changes span distant regions', function () {
        const padding = Array.from({ length: 12 }, (_value, index) => {
            return `line-${index}`;
        });
        const previous = ['alpha', ...padding, 'omega'].join('\n');
        const next = ['ALPHA', ...padding, 'OMEGA'].join('\n');

        const hunks = buildFileHunks('lines.txt', previous, next);

        assert.strictEqual(hunks.length, 2);
    });
});
