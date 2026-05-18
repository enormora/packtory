import assert from 'node:assert';
import { test } from 'mocha';
import { decorateWithPackageJsonExport } from './package-json-export.ts';

test('returns the input unchanged when exportPackageJson is undefined', () => {
    assert.deepStrictEqual(decorateWithPackageJsonExport({}, { '.': { import: './index.js' } }), {
        '.': { import: './index.js' }
    });
});

test('returns the input unchanged when exportPackageJson is missing on the bundle', () => {
    assert.deepStrictEqual(
        decorateWithPackageJsonExport({ exportPackageJson: undefined }, { '.': { import: './index.js' } }),
        { '.': { import: './index.js' } }
    );
});

test('adds a "./package.json" entry when exportPackageJson is true', () => {
    const result = decorateWithPackageJsonExport({ exportPackageJson: true }, { '.': { import: './index.js' } });

    assert.deepStrictEqual(result, {
        '.': { import: './index.js' },
        './package.json': './package.json'
    });
});

test('preserves existing entries alongside the package.json export', () => {
    const result = decorateWithPackageJsonExport(
        { exportPackageJson: true },
        { '.': { import: './a.js' }, './b': { import: './b.js' } }
    );

    assert.deepStrictEqual(result['./b'], { import: './b.js' });
});
