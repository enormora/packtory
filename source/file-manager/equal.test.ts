import assert from 'node:assert';
import { suite, test } from 'mocha';
import { areFileDescriptionEqual } from './equal.ts';
import { createFileDescription } from './file-description.ts';

suite('equal', function () {
    test('areFileDescriptionEqual returns true when filePath, content, and isExecutable all match', function () {
        assert.strictEqual(
            areFileDescriptionEqual(createFileDescription('a.js', 'x', true), createFileDescription('a.js', 'x', true)),
            true
        );
    });

    test('areFileDescriptionEqual returns false when the filePath differs', function () {
        assert.strictEqual(
            areFileDescriptionEqual(createFileDescription('a.js', 'x'), createFileDescription('b.js', 'x')),
            false
        );
    });

    test('areFileDescriptionEqual returns false when the content differs', function () {
        assert.strictEqual(
            areFileDescriptionEqual(createFileDescription('a.js', 'x'), createFileDescription('a.js', 'y')),
            false
        );
    });

    test('areFileDescriptionEqual returns false when the executable flag differs', function () {
        assert.strictEqual(
            areFileDescriptionEqual(
                createFileDescription('a.js', 'x', true),
                createFileDescription('a.js', 'x', false)
            ),
            false
        );
    });
});
