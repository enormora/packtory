import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fileDescriptionByPath } from './file-description-by-path.ts';

suite('file-description-by-path', function () {
    test('fileDescriptionByPath() indexes file descriptions by file path', function () {
        const indexed = fileDescriptionByPath([
            { filePath: 'package.json', content: '{}', isExecutable: false },
            { filePath: 'bin/cli.js', content: '#!/usr/bin/env node\n', isExecutable: true }
        ]);

        assert.deepStrictEqual(Array.from(indexed.keys()), ['package.json', 'bin/cli.js']);
        assert.deepStrictEqual(indexed.get('bin/cli.js'), {
            filePath: 'bin/cli.js',
            content: '#!/usr/bin/env node\n',
            isExecutable: true
        });
    });
});
