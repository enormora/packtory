import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfig, PacktoryConfig } from '../config/config.ts';
import { fooPackageConfigFactory, type FooPackageConfigShape } from '../test-libraries/config-fixtures.ts';
import { configToBuildAndPublishOptions } from './map-config.ts';

function packageWithPublishSettings(overrides: Partial<FooPackageConfigShape> = {}): PackageConfig {
    const packageConfig: PackageConfig = {
        ...fooPackageConfigFactory.build(),
        publishSettings: { access: 'public' },
        ...overrides
    };
    return packageConfig;
}

suite('map-config registry and attribution', function () {
    test('preserves the configured registrySettings on the produced options', function () {
        const packageConfig = packageWithPublishSettings();
        const result = configToBuildAndPublishOptions(
            'foo',
            { foo: packageConfig },
            {
                registrySettings: {
                    registryUrl: 'https://registry.example',
                    auth: { type: 'bearer-token', token: 'tok' }
                },
                packages: [ packageConfig ]
            },
            { existingBundles: [] }
        );

        assert.deepStrictEqual(result.registrySettings, {
            registryUrl: 'https://registry.example',
            auth: { type: 'bearer-token', token: 'tok' }
        });
    });

    test('defaults registrySettings to an empty object when the config omits them', function () {
        const packageConfig = packageWithPublishSettings();
        const config = { packages: [ packageConfig ] } as unknown as PacktoryConfig;

        const result = configToBuildAndPublishOptions('foo', { foo: packageConfig }, config, {
            existingBundles: []
        });

        assert.deepStrictEqual(result.registrySettings, {});
    });

    test('collects generated changelog outputs as ignored attribution paths', function () {
        const packageConfig = packageWithPublishSettings({ sourcesFolder: 'packages/foo' });
        const config = {
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            changelog: {
                outputs: [
                    { kind: 'repository-file', path: 'CHANGELOG.md' },
                    { kind: 'package-file', path: 'docs/CHANGELOG.md' }
                ]
            },
            packages: [ packageConfig ]
        } as const;

        const result = configToBuildAndPublishOptions('foo', { foo: packageConfig }, config, {
            existingBundles: [],
            repositoryFolder: '/repo'
        });

        assert.deepStrictEqual(result.ignoredAttributionPaths, [ 'CHANGELOG.md', 'packages/foo/docs/CHANGELOG.md' ]);
    });

    test('collects ignored attribution paths against the repository root by default', function () {
        const packageConfig = packageWithPublishSettings({ sourcesFolder: '/src/pkg-a' });
        const config = {
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] },
            packages: [ packageConfig ]
        } as const;

        const result = configToBuildAndPublishOptions('foo', { foo: packageConfig }, config, {
            existingBundles: []
        });

        assert.deepStrictEqual(result.ignoredAttributionPaths, [ 'src/pkg-a/CHANGELOG.md' ]);
    });

    test('throws a "missing publish settings" error when neither commonPackageSettings nor the package supplies one', function () {
        const packageWithoutPublishSettings = fooPackageConfigFactory.build();
        const config = {
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            packages: [ packageWithoutPublishSettings ]
        } as unknown as PacktoryConfig;

        assert.throws(
            function () {
                configToBuildAndPublishOptions('foo', { foo: packageWithoutPublishSettings }, config, {
                    existingBundles: []
                });
            },
            { message: 'Config for package "foo" is missing publish settings' }
        );
    });
});
