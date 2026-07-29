import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfigsByName, PacktoryConfigWithoutRegistry } from '../../config/config.ts';
import { packageConfigFixture, packageConfigsByNameFixture } from '../../test-libraries/config-fixtures.ts';
import { preparePackageOptions } from './prepare-package-options.ts';

function minimalPackageConfigsByName(): PackageConfigsByName {
    return packageConfigsByNameFixture([
        packageConfigFixture({
            name: 'pkg-a',
            sourcesFolder: '/src',
            mainPackageJson: { type: 'module' },
            roots: { main: { js: 'index.js' } }
        })
    ]);
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

        assert.partialDeepStrictEqual(prepared, {
            packageConfig: {
                name: 'pkg-a'
            },
            sharedOptions: {
                name: 'pkg-a'
            }
        });
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
