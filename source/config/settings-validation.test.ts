import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    packageConfigFixture,
    publicPublishSettings,
    publicPublishSettingsAllowingScripts
} from '../test-libraries/config-fixtures.ts';
import type { PackageConfig, PacktoryConfigWithoutRegistry } from './config.ts';
import { validateAllowScriptsConsistency, validatePublishSettingsArePlaced } from './settings-validation.ts';

const packageConfig: (overrides: Partial<PackageConfig>) => PackageConfig = packageConfigFixture;

function config(overrides: Partial<PacktoryConfigWithoutRegistry>): PacktoryConfigWithoutRegistry {
    return { packages: [], ...overrides };
}

suite('settings-validation', function () {
    test('validatePublishSettingsArePlaced returns no issues when commonPackageSettings.publishSettings is provided', function () {
        const result = validatePublishSettingsArePlaced(
            config({
                commonPackageSettings: { publishSettings: publicPublishSettings },
                packages: [ packageConfig({}) ]
            })
        );

        assert.deepStrictEqual(result, []);
    });

    test('validatePublishSettingsArePlaced returns no issues when every package declares publishSettings individually', function () {
        const result = validatePublishSettingsArePlaced(
            config({
                packages: [
                    packageConfig({ publishSettings: publicPublishSettings }),
                    packageConfig({ name: 'pkg-b', publishSettings: publicPublishSettings })
                ]
            })
        );

        assert.deepStrictEqual(result, []);
    });

    test('validatePublishSettingsArePlaced reports when publishSettings is missing from a package and from commonPackageSettings', function () {
        const result = validatePublishSettingsArePlaced(
            config({
                packages: [
                    packageConfig({ publishSettings: publicPublishSettings }),
                    packageConfig({ name: 'pkg-b' })
                ]
            })
        );

        assert.deepStrictEqual(result, [ 'publishSettings must be set in commonPackageSettings or in every package' ]);
    });

    test('validateAllowScriptsConsistency returns no issues when no package contributes a scripts attribute', function () {
        const result = validateAllowScriptsConsistency(config({ packages: [ packageConfig({}) ] }));

        assert.deepStrictEqual(result, []);
    });

    test('validateAllowScriptsConsistency requires allowScripts when a package adds scripts via additionalPackageJsonAttributes', function () {
        const result = validateAllowScriptsConsistency(
            config({
                packages: [
                    packageConfig({
                        additionalPackageJsonAttributes: { scripts: { build: 'tsc' } },
                        publishSettings: publicPublishSettings
                    })
                ]
            })
        );

        assert.deepStrictEqual(result, [
            'Package "pkg-a": "scripts" in additionalPackageJsonAttributes requires "publishSettings.allowScripts: true"'
        ]);
    });

    test('validateAllowScriptsConsistency permits a scripts attribute when allowScripts is true at the package level', function () {
        const result = validateAllowScriptsConsistency(
            config({
                packages: [
                    packageConfig({
                        additionalPackageJsonAttributes: { scripts: { build: 'tsc' } },
                        publishSettings: publicPublishSettingsAllowingScripts
                    })
                ]
            })
        );

        assert.deepStrictEqual(result, []);
    });

    test('validateAllowScriptsConsistency permits a scripts attribute when allowScripts is true via commonPackageSettings', function () {
        const result = validateAllowScriptsConsistency(
            config({
                commonPackageSettings: {
                    publishSettings: publicPublishSettingsAllowingScripts
                },
                packages: [ packageConfig({ additionalPackageJsonAttributes: { scripts: { build: 'tsc' } } }) ]
            })
        );

        assert.deepStrictEqual(result, []);
    });
});
