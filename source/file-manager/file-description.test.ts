import assert from 'node:assert';
import { test } from 'mocha';
import { createFileDescription } from './file-description.ts';

test('createFileDescription assembles a FileDescription with the given filePath, content, and executable flag', () => {
    assert.deepStrictEqual(createFileDescription('a/index.js', 'export {};', true), {
        filePath: 'a/index.js',
        content: 'export {};',
        isExecutable: true
    });
});

test('createFileDescription defaults the content to an empty string', () => {
    assert.strictEqual(createFileDescription('a.js').content, '');
});

test('createFileDescription defaults isExecutable to false', () => {
    assert.strictEqual(createFileDescription('a.js').isExecutable, false);
});
