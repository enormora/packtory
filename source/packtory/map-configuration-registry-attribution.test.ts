import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfiguration, PacktoryConfiguration } from '../configuration/configuration.ts';
import {
    fooPackageConfigurationFactory,
    type FooPackageConfigurationShape
} from '../test-libraries/configuration-fixtures.ts';
import { configurationToBuildAndPublishOptions } from './map-configuration.ts';

function packageWithPublishSettings(overrides: Partial<FooPackageConfigurationShape> = {}): PackageConfiguration {
    const packageConfiguration: PackageConfiguration = {
        ...fooPackageConfigurationFactory.build(),
        publishSettings: { access: 'public' },
        ...overrides
    };
    return packageConfiguration;
}

suite('map-config registry and attribution', function () {
    test('preserves the configured registrySettings on the produced options', function () {
        const packageConfiguration = packageWithPublishSettings();
        const result = configurationToBuildAndPublishOptions(
            'foo',
            { foo: packageConfiguration },
            {
                registrySettings: {
                    registryAddress: 'https://registry.example',
                    authentication: { type: 'bearer-token', token: 'tok' }
                },
                packages: [ packageConfiguration ]
            },
            { existingBundles: [] }
        );

        assert.deepStrictEqual(result.registrySettings, {
            registryAddress: 'https://registry.example',
            authentication: { type: 'bearer-token', token: 'tok' }
        });
    });

    test('defaults registrySettings to an empty object when the config omits them', function () {
        const packageConfiguration = packageWithPublishSettings();
        const configuration = { packages: [ packageConfiguration ] } as unknown as PacktoryConfiguration;

        const result = configurationToBuildAndPublishOptions('foo', { foo: packageConfiguration }, configuration, {
            existingBundles: []
        });

        assert.deepStrictEqual(result.registrySettings, {});
    });

    test('collects generated changelog outputs as ignored attribution paths', function () {
        const packageConfiguration = packageWithPublishSettings({ sourcesFolder: 'packages/foo' });
        const configuration = {
            registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
            changelog: {
                outputs: [
                    { kind: 'repository-file', path: 'CHANGELOG.md' },
                    { kind: 'package-file', path: 'documentation/CHANGELOG.md' }
                ]
            },
            packages: [ packageConfiguration ]
        } as const;

        const result = configurationToBuildAndPublishOptions('foo', { foo: packageConfiguration }, configuration, {
            existingBundles: [],
            repositoryFolder: '/repo'
        });

        assert.deepStrictEqual(result.ignoredAttributionPaths, [
            'CHANGELOG.md',
            'packages/foo/documentation/CHANGELOG.md'
        ]);
    });

    test('collects ignored attribution paths against the repository root by default', function () {
        const packageConfiguration = packageWithPublishSettings({ sourcesFolder: '/source/package-a' });
        const configuration = {
            registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
            changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
            packages: [ packageConfiguration ]
        } as const;

        const result = configurationToBuildAndPublishOptions('foo', { foo: packageConfiguration }, configuration, {
            existingBundles: []
        });

        assert.deepStrictEqual(result.ignoredAttributionPaths, [ 'source/package-a/CHANGELOG.md' ]);
    });

    test('throws a "missing publish settings" error when neither commonPackageSettings nor the package supplies one', function () {
        const packageWithoutPublishSettings = fooPackageConfigurationFactory.build();
        const configuration = {
            registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
            packages: [ packageWithoutPublishSettings ]
        } as unknown as PacktoryConfiguration;

        assert.throws(
            function () {
                configurationToBuildAndPublishOptions('foo', { foo: packageWithoutPublishSettings }, configuration, {
                    existingBundles: []
                });
            },
            { message: 'Config for package "foo" is missing publish settings' }
        );
    });
});
