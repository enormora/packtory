import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    packageConfigurationFixture,
    publicPublishSettings,
    publicPublishSettingsAllowingScripts
} from '../test-libraries/configuration-fixtures.ts';
import type { PackageConfiguration, PacktoryConfigurationWithoutRegistry } from './configuration.ts';
import { validateAllowScriptsConsistency, validatePublishSettingsArePlaced } from './settings-validation.ts';

const packageConfiguration: (overrides: Partial<PackageConfiguration>) => PackageConfiguration =
    packageConfigurationFixture;

function configuration(overrides: Partial<PacktoryConfigurationWithoutRegistry>): PacktoryConfigurationWithoutRegistry {
    return { packages: [], ...overrides };
}

suite('settings-validation', function () {
    test('validatePublishSettingsArePlaced returns no issues when commonPackageSettings.publishSettings is provided', function () {
        const result = validatePublishSettingsArePlaced(
            configuration({
                commonPackageSettings: { publishSettings: publicPublishSettings },
                packages: [ packageConfiguration({}) ]
            })
        );

        assert.deepStrictEqual(result, []);
    });

    test('validatePublishSettingsArePlaced returns no issues when every package declares publishSettings individually', function () {
        const result = validatePublishSettingsArePlaced(
            configuration({
                packages: [
                    packageConfiguration({ publishSettings: publicPublishSettings }),
                    packageConfiguration({ name: 'package-b', publishSettings: publicPublishSettings })
                ]
            })
        );

        assert.deepStrictEqual(result, []);
    });

    test('validatePublishSettingsArePlaced reports when publishSettings is missing from a package and from commonPackageSettings', function () {
        const result = validatePublishSettingsArePlaced(
            configuration({
                packages: [
                    packageConfiguration({ publishSettings: publicPublishSettings }),
                    packageConfiguration({ name: 'package-b' })
                ]
            })
        );

        assert.deepStrictEqual(result, [ 'publishSettings must be set in commonPackageSettings or in every package' ]);
    });

    test('validateAllowScriptsConsistency returns no issues when no package contributes a scripts attribute', function () {
        const result = validateAllowScriptsConsistency(configuration({ packages: [ packageConfiguration({}) ] }));

        assert.deepStrictEqual(result, []);
    });

    test('validateAllowScriptsConsistency requires allowScripts when a package adds scripts via additionalPackageManifestAttributes', function () {
        const result = validateAllowScriptsConsistency(
            configuration({
                packages: [
                    packageConfiguration({
                        additionalPackageManifestAttributes: { scripts: { build: 'tsc' } },
                        publishSettings: publicPublishSettings
                    })
                ]
            })
        );

        assert.deepStrictEqual(result, [
            'Package "package-a": "scripts" in additionalPackageManifestAttributes requires "publishSettings.allowScripts: true"'
        ]);
    });

    test('validateAllowScriptsConsistency permits a scripts attribute when allowScripts is true at the package level', function () {
        const result = validateAllowScriptsConsistency(
            configuration({
                packages: [
                    packageConfiguration({
                        additionalPackageManifestAttributes: { scripts: { build: 'tsc' } },
                        publishSettings: publicPublishSettingsAllowingScripts
                    })
                ]
            })
        );

        assert.deepStrictEqual(result, []);
    });

    test('validateAllowScriptsConsistency permits a scripts attribute when allowScripts is true via commonPackageSettings', function () {
        const result = validateAllowScriptsConsistency(
            configuration({
                commonPackageSettings: {
                    publishSettings: publicPublishSettingsAllowingScripts
                },
                packages: [
                    packageConfiguration({ additionalPackageManifestAttributes: { scripts: { build: 'tsc' } } })
                ]
            })
        );

        assert.deepStrictEqual(result, []);
    });
});
