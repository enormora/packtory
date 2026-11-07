import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildExportEntry, toImportTarget, type RootFileDescription } from './package-shape.ts';

const baseRoot: RootFileDescription = {
    javaScript: { inputFilePath: '/source/index.ts', targetFilePath: 'index.js', isExecutable: false, content: '' }
};

suite('package-shape', function () {
    test('buildExportEntry emits direct JSON exports and type-only declaration exports', function () {
        assert.strictEqual(
            buildExportEntry({
                json: {
                    inputFilePath: '/source/config.json',
                    targetFilePath: 'config.json',
                    content: '{}',
                    isExecutable: false
                }
            }),
            './config.json'
        );
        assert.deepStrictEqual(
            buildExportEntry({
                declarationFile: {
                    inputFilePath: '/source/index.d.ts',
                    targetFilePath: 'index.d.ts'
                }
            }),
            { types: './index.d.ts' }
        );
    });

    test('toImportTarget prepends "./" to relative target file paths', function () {
        assert.strictEqual(toImportTarget('index.js'), './index.js');
        assert.strictEqual(toImportTarget('nested/lib.js'), './nested/lib.js');
    });

    test('buildExportEntry returns an entry with just an "import" target when no declaration file is attached', function () {
        assert.deepStrictEqual(buildExportEntry(baseRoot), { import: './index.js' });
    });

    test('buildExportEntry includes a "types" target when the root has an attached declaration file', function () {
        const root: RootFileDescription = {
            ...baseRoot,
            declarationFile: { inputFilePath: '/source/index.d.ts', targetFilePath: 'index.d.ts' }
        };

        assert.deepStrictEqual(buildExportEntry(root), { import: './index.js', types: './index.d.ts' });
    });
});
