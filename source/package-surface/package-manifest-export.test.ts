import assert from 'node:assert';
import { suite, test } from 'mocha';
import { decorateWithPackageManifestExport } from './package-manifest-export.ts';

suite('package-json-export', function () {
    test('returns the input unchanged when exportPackageManifest is undefined', function () {
        assert.deepStrictEqual(decorateWithPackageManifestExport({}, { '.': { import: './index.js' } }), {
            '.': { import: './index.js' }
        });
    });

    test('returns the input unchanged when exportPackageManifest is missing on the bundle', function () {
        assert.deepStrictEqual(
            decorateWithPackageManifestExport({ exportPackageManifest: undefined }, { '.': { import: './index.js' } }),
            { '.': { import: './index.js' } }
        );
    });

    test('adds a "./package.json" entry when exportPackageManifest is true', function () {
        const result = decorateWithPackageManifestExport({ exportPackageManifest: true }, {
            '.': { import: './index.js' }
        });

        assert.deepStrictEqual(result, {
            '.': { import: './index.js' },
            './package.json': './package.json'
        });
    });

    test('preserves existing entries alongside the package.json export', function () {
        const result = decorateWithPackageManifestExport(
            { exportPackageManifest: true },
            { '.': { import: './a.js' }, './b': { import: './b.js' } }
        );

        assert.deepStrictEqual(result['./b'], { import: './b.js' });
    });
});
