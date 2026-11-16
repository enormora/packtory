import assert from 'node:assert';
import { suite, test } from 'mocha';
import { inspectPackageManifestProvenance } from './inspect-package-manifest-provenance.ts';

suite('inspect-package-json-provenance', function () {
    test('inspectPackageManifestProvenance marks fields present in mainPackageManifest', function () {
        const provenance = inspectPackageManifestProvenance(
            { name: 'package', version: '1.0.0', type: 'module' },
            { type: 'module' },
            undefined
        );

        assert.deepStrictEqual(provenance.type, { source: 'mainPackageManifest' });
    });

    test('inspectPackageManifestProvenance marks fields present in additionalAttributes', function () {
        const provenance = inspectPackageManifestProvenance(
            { name: 'package', version: '1.0.0', publishConfig: { access: 'public' } },
            {},
            { publishConfig: { access: 'public' } }
        );

        assert.deepStrictEqual(provenance.publishConfig, { source: 'additionalAttributes' });
    });

    test('inspectPackageManifestProvenance marks fields not in any source as derived', function () {
        const provenance = inspectPackageManifestProvenance({ name: 'package', version: '1.0.0' }, {}, undefined);

        assert.partialDeepStrictEqual(provenance, {
            name: { source: 'derived' },
            version: { source: 'derived' }
        });
    });

    test('inspectPackageManifestProvenance prefers additionalAttributes over mainPackageManifest when both contain the field', function () {
        const provenance = inspectPackageManifestProvenance(
            { keywords: [ 'a', 'b' ] },
            { keywords: [ 'x' ] },
            { keywords: [ 'a', 'b' ] }
        );

        assert.deepStrictEqual(provenance.keywords, { source: 'additionalAttributes' });
    });

    test('inspectPackageManifestProvenance treats undefined additionalAttributes as absent', function () {
        const provenance = inspectPackageManifestProvenance({ name: 'package' }, { name: 'package' }, undefined);
        assert.deepStrictEqual(provenance, { name: { source: 'mainPackageManifest' } });
    });

    test('inspectPackageManifestProvenance returns an empty object for an empty assembled manifest', function () {
        const provenance = inspectPackageManifestProvenance({}, { name: 'package' }, { scripts: {} });
        assert.deepStrictEqual(provenance, {});
    });
});
