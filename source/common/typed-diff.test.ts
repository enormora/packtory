import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createStructuredPatch } from './typed-diff.ts';

suite('typed-diff', function () {
    test('createStructuredPatch returns oldFileName and newFileName in the resulting patch', function () {
        const patch = createStructuredPatch('a.txt', 'b.txt', 'one\n', 'two\n');
        assert.strictEqual(patch.oldFileName, 'a.txt');
        assert.strictEqual(patch.newFileName, 'b.txt');
    });

    test('createStructuredPatch reports an empty hunks array when the inputs are identical', function () {
        const patch = createStructuredPatch('a.txt', 'a.txt', 'same\n', 'same\n');
        assert.deepStrictEqual(patch.hunks, []);
    });

    test('createStructuredPatch returns one hunk describing the change when the inputs differ', function () {
        const patch = createStructuredPatch('a.txt', 'a.txt', 'one\n', 'two\n');
        assert.strictEqual(patch.hunks.length, 1);
        assert.ok(patch.hunks[0]?.lines.some((line) => line.startsWith('-')));
        assert.ok(patch.hunks[0]?.lines.some((line) => line.startsWith('+')));
    });
});
