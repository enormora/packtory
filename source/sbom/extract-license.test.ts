import assert from 'node:assert';
import { suite, test } from 'mocha';
import { extractLicenseFromManifest } from './extract-license.ts';

suite('extract-license', function () {
    test('returns the license string when the manifest declares a non-empty string license', function () {
        assert.strictEqual(extractLicenseFromManifest({ license: 'MIT' }), 'MIT');
    });

    test('returns undefined when the manifest declares an empty license string', function () {
        assert.strictEqual(extractLicenseFromManifest({ license: '' }), undefined);
    });

    test('returns undefined when the manifest declares a non-string license', function () {
        assert.strictEqual(extractLicenseFromManifest({ license: { type: 'MIT' } }), undefined);
    });

    test('returns undefined when the manifest has no license field', function () {
        assert.strictEqual(extractLicenseFromManifest({ name: 'pkg' }), undefined);
    });

    test('returns undefined when the input is not an object', function () {
        assert.strictEqual(extractLicenseFromManifest(null), undefined);
        assert.strictEqual(extractLicenseFromManifest('not an object'), undefined);
        assert.strictEqual(extractLicenseFromManifest(42), undefined);
        assert.strictEqual(extractLicenseFromManifest(undefined), undefined);
    });

    test('returns undefined when the input is an array', function () {
        assert.strictEqual(extractLicenseFromManifest([ 'MIT' ]), undefined);
    });
});
