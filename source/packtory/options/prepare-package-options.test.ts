/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfigsByName, PacktoryConfigWithoutRegistry } from '../../config/config.ts';
import { preparePackageOptions } from './prepare-package-options.ts';

function minimalPackageConfigsByName(): PackageConfigsByName {
    return {
        'pkg-a': {
            name: 'pkg-a',
            sourcesFolder: '/src',
            mainPackageJson: { name: 'pkg-a', version: '1.0.0', type: 'module' },
            roots: { main: { js: 'index.js' } }
        } as never
    };
}

function minimalPacktoryConfig(): PacktoryConfigWithoutRegistry {
    return { packages: [] };
}

suite('prepare-package-options', function () {
    test('preparePackageOptions throws when the requested package is missing from the config map', function () {
        try {
            preparePackageOptions('missing', minimalPackageConfigsByName(), minimalPacktoryConfig(), []);
            assert.fail('expected preparePackageOptions to throw');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Config for package "missing" is missing');
        }
    });

    test('preparePackageOptions returns the selected package config along with shared options', function () {
        const prepared = preparePackageOptions('pkg-a', minimalPackageConfigsByName(), minimalPacktoryConfig(), []);

        assert.strictEqual(prepared.packageConfig.name, 'pkg-a');
        assert.strictEqual(prepared.sharedOptions.name, 'pkg-a');
    });

    test('preparePackageOptions defaults versioning to automatic when not configured', function () {
        const prepared = preparePackageOptions('pkg-a', minimalPackageConfigsByName(), minimalPacktoryConfig(), []);

        assert.deepStrictEqual(prepared.versioning, { automatic: true });
    });

    test('preparePackageOptions normalizes root paths against the sources folder', function () {
        const prepared = preparePackageOptions('pkg-a', minimalPackageConfigsByName(), minimalPacktoryConfig(), []);

        assert.strictEqual(prepared.sharedOptions.roots.main?.js, '/src/index.js');
    });
});
