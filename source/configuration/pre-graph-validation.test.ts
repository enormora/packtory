import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageConfigurationFixture, publicPublishSettings } from '../test-libraries/configuration-fixtures.ts';
import type { PackageConfiguration, PacktoryConfigurationWithoutRegistry } from './configuration.ts';
import { collectPreGraphIssues, packageListToRecord } from './pre-graph-validation.ts';

const packageConfiguration: (overrides: Partial<PackageConfiguration>) => PackageConfiguration =
    packageConfigurationFixture;

suite('pre-graph-validation', function () {
    test('packageListToRecord indexes packages by name', function () {
        const packageA = packageConfiguration({ name: 'a' });
        const packageB = packageConfiguration({ name: 'b' });

        assert.deepStrictEqual(packageListToRecord([ packageA, packageB ]), { a: packageA, b: packageB });
    });

    test('collectPreGraphIssues returns no issues for a well-formed single-package config with publishSettings on the package', function () {
        const configuration: PacktoryConfigurationWithoutRegistry = {
            packages: [ packageConfiguration({ publishSettings: publicPublishSettings }) ]
        };

        assert.deepStrictEqual(collectPreGraphIssues(configuration), []);
    });

    test('collectPreGraphIssues reports a missing publishSettings placement', function () {
        const configuration: PacktoryConfigurationWithoutRegistry = { packages: [ packageConfiguration({}) ] };

        assert.ok(
            collectPreGraphIssues(configuration).includes(
                'publishSettings must be set in commonPackageSettings or in every package'
            )
        );
    });

    test('collectPreGraphIssues reports a missing bundle dependency target', function () {
        const configuration = {
            packages: [
                packageConfiguration({
                    publishSettings: publicPublishSettings,
                    bundleDependencies: [ 'missing' ]
                })
            ]
        };

        assert.ok(
            collectPreGraphIssues(configuration).includes(
                'Bundle dependency "missing" referenced in "package-a" does not exist'
            )
        );
    });

    test('collectPreGraphIssues reports a root configuration violation', function () {
        const configuration = {
            packages: [
                packageConfiguration({
                    publishSettings: publicPublishSettings,
                    roots: { main: { javaScript: 'index.js' }, extra: { javaScript: 'extra.js' } }
                })
            ]
        };

        assert.ok(
            collectPreGraphIssues(configuration).includes(
                'Package "package-a" must define defaultModuleRoot when multiple roots exist'
            )
        );
    });
});
