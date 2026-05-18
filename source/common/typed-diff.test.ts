import assert from 'node:assert';
import { test } from 'mocha';
import { createStructuredPatch } from './typed-diff.ts';

test('createStructuredPatch returns oldFileName and newFileName in the resulting patch', () => {
    const patch = createStructuredPatch('a.txt', 'b.txt', 'one\n', 'two\n');
    assert.strictEqual(patch.oldFileName, 'a.txt');
    assert.strictEqual(patch.newFileName, 'b.txt');
});

test('createStructuredPatch reports an empty hunks array when the inputs are identical', () => {
    const patch = createStructuredPatch('a.txt', 'a.txt', 'same\n', 'same\n');
    assert.deepStrictEqual(patch.hunks, []);
});

test('createStructuredPatch returns one hunk describing the change when the inputs differ', () => {
    const patch = createStructuredPatch('a.txt', 'a.txt', 'one\n', 'two\n');
    assert.strictEqual(patch.hunks.length, 1);
    assert.ok(patch.hunks[0]?.lines.some((line) => line.startsWith('-')));
    assert.ok(patch.hunks[0]?.lines.some((line) => line.startsWith('+')));
});
