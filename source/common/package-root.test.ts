import assert from 'node:assert';
import { suite, test } from 'mocha';
import { rootEntryFile, rootFiles, type PackageRoot } from './package-root.ts';

suite('package roots', function () {
    test('collects JavaScript and declarations in entry order', function () {
        const root = { javaScript: 'index.js', declarationFile: 'index.d.ts' };
        assert.deepStrictEqual(rootFiles(root), [ 'index.js', 'index.d.ts' ]);
        assert.strictEqual(rootEntryFile(root), 'index.js');
    });

    test('collects JSON and declaration-only entries without runtime companions', function () {
        assert.deepStrictEqual(rootFiles({ json: 'config.json' }), [ 'config.json' ]);
        assert.deepStrictEqual(rootFiles({ declarationFile: 'index.d.ts' }), [ 'index.d.ts' ]);
        assert.strictEqual(rootEntryFile({ json: 'config.json' }), 'config.json');
        assert.strictEqual(rootEntryFile({ declarationFile: 'index.d.ts' }), 'index.d.ts');
    });

    test('rejects a root without any entry file', function () {
        assert.throws(function () {
            return rootEntryFile({} as PackageRoot<string>);
        }, { message: 'Package root has no entry file' });
    });
});
