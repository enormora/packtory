import assert from 'node:assert';
import { test } from 'mocha';
import { areFileDescriptionEqual } from './equal.ts';
import { createFileDescription } from './file-description.ts';

test('areFileDescriptionEqual returns true when filePath, content, and isExecutable all match', () => {
    assert.strictEqual(
        areFileDescriptionEqual(createFileDescription('a.js', 'x', true), createFileDescription('a.js', 'x', true)),
        true
    );
});

test('areFileDescriptionEqual returns false when the filePath differs', () => {
    assert.strictEqual(
        areFileDescriptionEqual(createFileDescription('a.js', 'x'), createFileDescription('b.js', 'x')),
        false
    );
});

test('areFileDescriptionEqual returns false when the content differs', () => {
    assert.strictEqual(
        areFileDescriptionEqual(createFileDescription('a.js', 'x'), createFileDescription('a.js', 'y')),
        false
    );
});

test('areFileDescriptionEqual returns false when the executable flag differs', () => {
    assert.strictEqual(
        areFileDescriptionEqual(createFileDescription('a.js', 'x', true), createFileDescription('a.js', 'x', false)),
        false
    );
});
