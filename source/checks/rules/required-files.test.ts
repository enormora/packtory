import assert from 'node:assert';
import { test } from 'mocha';
import type { PackageChecksSettings } from '../../config/config.ts';
import { checkBundle as bundle } from '../../test-libraries/check-bundle-fixture.ts';
import { requiredFilesRule } from './required-files.ts';

function packageRequiring(files: readonly string[]): PackageChecksSettings {
    return { requiredFiles: { files } };
}

test('rule definition exposes name, schemas and a run function', () => {
    assert.strictEqual(requiredFilesRule.name, 'requiredFiles');
    assert.strictEqual(typeof requiredFilesRule.run, 'function');
});

test('returns no issues when settings are missing', () => {
    const result = requiredFilesRule.run({
        bundles: [bundle('a', [])],
        settings: undefined,
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('returns no issues when the rule is disabled', () => {
    const result = requiredFilesRule.run({
        bundles: [bundle('a', [])],
        settings: { requiredFiles: { enabled: false, files: ['LICENSE'] } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('reports a missing global required file for every bundle that lacks it', () => {
    const result = requiredFilesRule.run({
        bundles: [bundle('a', ['LICENSE']), bundle('b', [])],
        settings: { requiredFiles: { enabled: true, files: ['LICENSE'] } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, ['Package "b" is missing required file "LICENSE"']);
});

test('returns no issues when all bundles contain every globally required file', () => {
    const result = requiredFilesRule.run({
        bundles: [bundle('a', ['LICENSE', 'readme.md']), bundle('b', ['LICENSE', 'readme.md'])],
        settings: { requiredFiles: { enabled: true, files: ['LICENSE', 'readme.md'] } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('extends global required files with per-package required files', () => {
    const result = requiredFilesRule.run({
        bundles: [bundle('a', ['LICENSE'])],
        settings: { requiredFiles: { enabled: true, files: ['LICENSE'] } },
        perPackageSettings: new Map([['a', packageRequiring(['CHANGELOG.md'])]])
    });

    assert.deepStrictEqual(result, ['Package "a" is missing required file "CHANGELOG.md"']);
});

test('deduplicates required files when per-package config repeats a global entry', () => {
    const result = requiredFilesRule.run({
        bundles: [bundle('a', [])],
        settings: { requiredFiles: { enabled: true, files: ['LICENSE'] } },
        perPackageSettings: new Map([['a', packageRequiring(['LICENSE'])]])
    });

    assert.deepStrictEqual(result, ['Package "a" is missing required file "LICENSE"']);
});

test('uses per-package required files even when the global list is empty', () => {
    const result = requiredFilesRule.run({
        bundles: [bundle('a', [])],
        settings: { requiredFiles: { enabled: true } },
        perPackageSettings: new Map([['a', packageRequiring(['LICENSE'])]])
    });

    assert.deepStrictEqual(result, ['Package "a" is missing required file "LICENSE"']);
});

test('reports multiple missing files for a single bundle', () => {
    const result = requiredFilesRule.run({
        bundles: [bundle('a', [])],
        settings: { requiredFiles: { enabled: true, files: ['LICENSE', 'readme.md'] } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, [
        'Package "a" is missing required file "LICENSE"',
        'Package "a" is missing required file "readme.md"'
    ]);
});
