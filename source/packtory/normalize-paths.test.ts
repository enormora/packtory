import assert from 'node:assert';
import { suite, test } from 'mocha';
import { normalizeAdditionalFile, normalizeRoot } from './normalize-paths.ts';

suite('normalize-paths', function () {
    test('normalizeRoot leaves absolute js paths unchanged', function () {
        assert.deepStrictEqual(normalizeRoot({ js: '/abs/index.js' }, '/src'), { js: '/abs/index.js' });
    });

    test('normalizeRoot prefixes relative js paths with the source folder', function () {
        assert.deepStrictEqual(normalizeRoot({ js: 'index.js' }, '/src'), { js: '/src/index.js' });
    });

    test('normalizeRoot also normalizes the declaration file path when present', function () {
        assert.deepStrictEqual(normalizeRoot({ js: 'index.js', declarationFile: 'index.d.ts' }, '/src'), {
            js: '/src/index.js',
            declarationFile: '/src/index.d.ts'
        });
    });

    test('normalizeRoot omits the declaration file from the output when none is provided', function () {
        const result = normalizeRoot({ js: 'index.js' }, '/src');
        assert.strictEqual('declarationFile' in result, false);
    });

    test('normalizeAdditionalFile resolves the sourceFilePath relative to the source folder', function () {
        assert.deepStrictEqual(
            normalizeAdditionalFile({ sourceFilePath: 'README.md', targetFilePath: 'README.md' }, '/src'),
            { sourceFilePath: '/src/README.md', targetFilePath: 'README.md' }
        );
    });

    test('normalizeAdditionalFile keeps an absolute sourceFilePath unchanged', function () {
        assert.deepStrictEqual(
            normalizeAdditionalFile({ sourceFilePath: '/abs/README.md', targetFilePath: 'README.md' }, '/src'),
            { sourceFilePath: '/abs/README.md', targetFilePath: 'README.md' }
        );
    });

    test('normalizeAdditionalFile keeps the targetFilePath untouched', function () {
        assert.strictEqual(
            normalizeAdditionalFile({ sourceFilePath: 'a.md', targetFilePath: 'docs/a.md' }, '/src').targetFilePath,
            'docs/a.md'
        );
    });
});
