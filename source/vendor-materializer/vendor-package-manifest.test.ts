import assert from 'node:assert';
import { suite, test } from 'mocha';
import { parseManifestSummary } from './vendor-package-manifest.ts';

suite('vendor package dependency discovery', function () {
    test('omits optional peers while preserving dependencies and required peers', function () {
        const result = parseManifestSummary(JSON.stringify({
            dependencies: { dependency: '^1' },
            peerDependencies: { optional: '^1', required: '^2' },
            peerDependenciesMeta: { optional: { optional: true }, required: { optional: false } }
        }));

        assert.ok(result.isOk);
        assert.deepStrictEqual(result.value, { dependencies: [ 'dependency' ], peers: [ 'required' ] });
    });

    test('declines dependency discovery for invalid optional peer metadata', function () {
        const result = parseManifestSummary(JSON.stringify({
            dependencies: { dependency: '^1' },
            peerDependencies: { peer: '^1' },
            peerDependenciesMeta: { peer: { optional: 'yes' } }
        }));

        assert.ok(result.isOk);
        assert.deepStrictEqual(result.value, { dependencies: [], peers: [] });
    });
});
