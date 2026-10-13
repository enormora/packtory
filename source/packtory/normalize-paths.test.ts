import assert from 'node:assert';
import { suite, test } from 'mocha';
import { normalizeAdditionalFile, normalizeRoot } from './normalize-paths.ts';

suite('normalize-paths', function () {
    test('normalizeRoot leaves absolute js paths unchanged', function () {
        assert.deepStrictEqual(normalizeRoot({ javaScript: '/abs/index.js' }, '/source'), {
            javaScript: '/abs/index.js'
        });
    });

    test('normalizeRoot prefixes relative js paths with the source folder', function () {
        assert.deepStrictEqual(normalizeRoot({ javaScript: 'index.js' }, '/source'), {
            javaScript: '/source/index.js'
        });
    });

    test('normalizeRoot also normalizes the declaration file path when present', function () {
        assert.deepStrictEqual(normalizeRoot({ javaScript: 'index.js', declarationFile: 'index.d.ts' }, '/source'), {
            javaScript: '/source/index.js',
            declarationFile: '/source/index.d.ts'
        });
    });

    test('normalizeRoot omits the declaration file from the output when none is provided', function () {
        const result = normalizeRoot({ javaScript: 'index.js' }, '/source');
        assert.strictEqual(Object.hasOwn(result, 'declarationFile'), false);
    });

    test('normalizeAdditionalFile resolves the inputFilePath relative to the source folder', function () {
        assert.deepStrictEqual(
            normalizeAdditionalFile({ inputFilePath: 'README.md', targetFilePath: 'README.md' }, '/source'),
            { inputFilePath: '/source/README.md', targetFilePath: 'README.md' }
        );
    });

    test('normalizeAdditionalFile keeps an absolute inputFilePath unchanged', function () {
        assert.deepStrictEqual(
            normalizeAdditionalFile({ inputFilePath: '/abs/README.md', targetFilePath: 'README.md' }, '/source'),
            { inputFilePath: '/abs/README.md', targetFilePath: 'README.md' }
        );
    });

    test('normalizeAdditionalFile keeps the targetFilePath untouched', function () {
        assert.strictEqual(
            normalizeAdditionalFile({ inputFilePath: 'a.md', targetFilePath: 'documentation/a.md' }, '/source')
                .targetFilePath,
            'documentation/a.md'
        );
    });
});
