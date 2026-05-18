import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFileDescription } from './file-description.ts';

suite('file-description', function () {
    test('createFileDescription assembles a FileDescription with the given filePath, content, and executable flag', function () {
        assert.deepStrictEqual(createFileDescription('a/index.js', 'export {};', true), {
            filePath: 'a/index.js',
            content: 'export {};',
            isExecutable: true
        });
    });

    test('createFileDescription defaults the content to an empty string', function () {
        assert.strictEqual(createFileDescription('a.js').content, '');
    });

    test('createFileDescription defaults isExecutable to false', function () {
        assert.strictEqual(createFileDescription('a.js').isExecutable, false);
    });
});
