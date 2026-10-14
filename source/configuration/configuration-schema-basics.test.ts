import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { suite, test } from 'mocha';
import {
    configurationWith,
    configurationWithEmptyNoDuplicatedFilesAllowList,
    emptyNoDuplicatedFilesAllowListMessage,
    invalidConfiguration,
    packageConfiguration,
    validConfiguration
} from '../test-libraries/configuration-schema-test-support.ts';
import { getBundledDependencies } from './configuration.ts';
import { packtoryConfigurationSchema } from './packtory-configuration-schema.ts';
import { packtoryConfigurationWithoutRegistrySchema } from './packtory-configuration-without-registry-schema.ts';

suite('config schema basics', function () {
    suite('basic registry and package settings', function () {
        test('getBundledDependencies combines direct and peer bundled dependencies', function () {
            assert.deepStrictEqual(
                getBundledDependencies({ bundleDependencies: [ 'bar' ], bundlePeerDependencies: [ 'baz' ] }),
                [ 'bar', 'baz' ]
            );
        });

        test('getBundledDependencies returns an empty list when no bundled dependencies are defined', function () {
            assert.deepStrictEqual(getBundledDependencies({}), []);
        });

        test('config schema accepts a valid config', function () {
            assert.strictEqual(safeParse(packtoryConfigurationSchema, configurationWith({})).success, true);
        });

        test('config schema accepts configs without registrySettings', function () {
            assert.strictEqual(
                safeParse(packtoryConfigurationSchema, { packages: [ packageConfiguration() ] }).success,
                true
            );
        });

        test('config without registry schema rejects an empty packages tuple', function () {
            assert.strictEqual(safeParse(packtoryConfigurationWithoutRegistrySchema, { packages: [] }).success, false);
        });

        test(
            'validation succeeds when commonPackageSettings is defined but empty',
            validConfiguration(configurationWith({ commonPackageSettings: {} }))
        );

        test(
            'validation succeeds when registrySettings is omitted',
            validConfiguration({ packages: [ packageConfiguration() ] })
        );

        test(
            'validation succeeds when registrySettings is provided without auth',
            validConfiguration(configurationWith({ registrySettings: { registryAddress: 'https://registry.example' } }))
        );
    });

    suite('checks and package validation', function () {
        test(
            'validation fails when packages is an empty array',
            invalidConfiguration(configurationWith({ packages: [] }), [ 'invalid value doesn’t match expected union' ])
        );

        test(
            'validation fails when a package supplies entryPoints instead of roots',
            invalidConfiguration(
                configurationWith({ packages: [ packageConfiguration({ roots: undefined, entryPoints: [] }) ] }),
                [
                    'invalid value doesn’t match expected union'
                ]
            )
        );

        test(
            'validation fails when checks.noDuplicatedFiles.enabled is missing',
            invalidConfiguration(configurationWith({ checks: { noDuplicatedFiles: {} } }), [
                'invalid value doesn’t match expected union'
            ])
        );

        test(
            'validation fails when a per-package noDuplicatedFiles.allowList contains an empty path',
            invalidConfiguration(configurationWithEmptyNoDuplicatedFilesAllowList(), [
                emptyNoDuplicatedFilesAllowListMessage
            ])
        );

        test(
            'validation succeeds when a package declares a per-package noDuplicatedFiles allowList',
            validConfiguration(configurationWith({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: [ packageConfiguration({ checks: { noDuplicatedFiles: { allowList: [ 'foo/bar.ts' ] } } }) ]
            }))
        );

        test(
            'validation succeeds and preserves the checks.noDuplicatedFiles settings',
            validConfiguration(configurationWith({ checks: { noDuplicatedFiles: { enabled: true } } }))
        );

        test(
            'validation succeeds when commonPackageSettings is defined with all optional values',
            validConfiguration(configurationWith({
                commonPackageSettings: {
                    includeSourceMapFiles: true,
                    additionalFiles: [],
                    additionalPackageManifestAttributes: {}
                }
            }))
        );

        test(
            'validation succeeds when commonPackageSettings is not given and a package contains all required settings',
            validConfiguration(configurationWith({}))
        );
    });
});
