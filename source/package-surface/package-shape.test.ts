import assert from 'node:assert';
import { test } from 'mocha';
import { buildExportEntry, toImportTarget, type RootFileDescription } from './package-shape.ts';

const baseRoot: RootFileDescription = {
    js: { sourceFilePath: '/src/index.ts', targetFilePath: 'index.js', isExecutable: false, content: '' }
};

test('toImportTarget prepends "./" to relative target file paths', () => {
    assert.strictEqual(toImportTarget('index.js'), './index.js');
    assert.strictEqual(toImportTarget('nested/lib.js'), './nested/lib.js');
});

test('buildExportEntry returns an entry with just an "import" target when no declaration file is attached', () => {
    assert.deepStrictEqual(buildExportEntry(baseRoot), { import: './index.js' });
});

test('buildExportEntry includes a "types" target when the root has an attached declaration file', () => {
    const root: RootFileDescription = {
        ...baseRoot,
        declarationFile: { sourceFilePath: '/src/index.d.ts', targetFilePath: 'index.d.ts' }
    };

    assert.deepStrictEqual(buildExportEntry(root), { import: './index.js', types: './index.d.ts' });
});
