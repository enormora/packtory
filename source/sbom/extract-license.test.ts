import assert from 'node:assert';
import { test } from 'mocha';
import { extractLicenseFromManifest } from './extract-license.ts';

test('returns the license string when the manifest declares a non-empty string license', () => {
    assert.strictEqual(extractLicenseFromManifest({ license: 'MIT' }), 'MIT');
});

test('returns undefined when the manifest declares an empty license string', () => {
    assert.strictEqual(extractLicenseFromManifest({ license: '' }), undefined);
});

test('returns undefined when the manifest declares a non-string license', () => {
    assert.strictEqual(extractLicenseFromManifest({ license: { type: 'MIT' } }), undefined);
});

test('returns undefined when the manifest has no license field', () => {
    assert.strictEqual(extractLicenseFromManifest({ name: 'pkg' }), undefined);
});

test('returns undefined when the input is not an object', () => {
    assert.strictEqual(extractLicenseFromManifest(null), undefined);
    assert.strictEqual(extractLicenseFromManifest('not an object'), undefined);
    assert.strictEqual(extractLicenseFromManifest(42), undefined);
    assert.strictEqual(extractLicenseFromManifest(undefined), undefined);
});

test('returns undefined when the input is an array', () => {
    assert.strictEqual(extractLicenseFromManifest(['MIT']), undefined);
});
