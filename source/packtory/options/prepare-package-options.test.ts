import assert from 'node:assert';
import { suite, test } from 'mocha';
import type {
    PackageConfigurationsByName,
    PacktoryConfigurationWithoutRegistry
} from '../../configuration/configuration.ts';
import {
    packageConfigurationFixture,
    packageConfigurationsByNameFixture
} from '../../test-libraries/configuration-fixtures.ts';
import { preparePackageOptions } from './prepare-package-options.ts';

function minimalPackageConfigurationsByName(): PackageConfigurationsByName {
    return packageConfigurationsByNameFixture([
        packageConfigurationFixture({
            name: 'package-a',
            sourcesFolder: '/source',
            mainPackageManifest: { type: 'module' },
            roots: { main: { javaScript: 'index.js' } }
        })
    ]);
}

function minimalPacktoryConfiguration(): PacktoryConfigurationWithoutRegistry {
    return { packages: [] };
}

suite('prepare-package-options', function () {
    test('preparePackageOptions throws when the requested package is missing from the config map', function () {
        try {
            preparePackageOptions('missing', minimalPackageConfigurationsByName(), minimalPacktoryConfiguration(), []);
            assert.fail('expected preparePackageOptions to throw');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Config for package "missing" is missing');
        }
    });

    test('preparePackageOptions returns the selected package config along with shared options', function () {
        const prepared = preparePackageOptions(
            'package-a',
            minimalPackageConfigurationsByName(),
            minimalPacktoryConfiguration(),
            []
        );

        assert.partialDeepStrictEqual(prepared, {
            packageConfiguration: {
                name: 'package-a'
            },
            sharedOptions: {
                name: 'package-a'
            }
        });
    });

    test('preparePackageOptions defaults versioning to automatic when not configured', function () {
        const prepared = preparePackageOptions(
            'package-a',
            minimalPackageConfigurationsByName(),
            minimalPacktoryConfiguration(),
            []
        );

        assert.deepStrictEqual(prepared.versioning, { automatic: true });
    });

    test('preparePackageOptions normalizes root paths against the sources folder', function () {
        const prepared = preparePackageOptions(
            'package-a',
            minimalPackageConfigurationsByName(),
            minimalPacktoryConfiguration(),
            []
        );

        assert.strictEqual(prepared.sharedOptions.roots.main?.javaScript, '/source/index.js');
    });
});
