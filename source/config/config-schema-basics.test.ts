import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { suite, test } from 'mocha';
import {
    configWith,
    configWithEmptyNoDuplicatedFilesAllowList,
    emptyNoDuplicatedFilesAllowListMessage,
    invalidConfig,
    packageConfig,
    validConfig
} from '../test-libraries/config-schema-test-support.ts';
import { getBundledDependencies } from './config.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';

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
            assert.strictEqual(safeParse(packtoryConfigSchema, configWith({})).success, true);
        });

        test('config schema accepts configs without registrySettings', function () {
            assert.strictEqual(safeParse(packtoryConfigSchema, { packages: [ packageConfig() ] }).success, true);
        });

        test('config without registry schema rejects an empty packages tuple', function () {
            assert.strictEqual(safeParse(packtoryConfigWithoutRegistrySchema, { packages: [] }).success, false);
        });

        test(
            'validation succeeds when commonPackageSettings is defined but empty',
            validConfig(configWith({ commonPackageSettings: {} }))
        );

        test(
            'validation succeeds when registrySettings is omitted',
            validConfig({ packages: [ packageConfig() ] })
        );

        test(
            'validation succeeds when registrySettings is provided without auth',
            validConfig(configWith({ registrySettings: { registryUrl: 'https://registry.example' } }))
        );
    });

    suite('checks and package validation', function () {
        test(
            'validation fails when packages is an empty array',
            invalidConfig(configWith({ packages: [] }), [ 'invalid value doesn’t match expected union' ])
        );

        test(
            'validation fails when a package supplies entryPoints instead of roots',
            invalidConfig(configWith({ packages: [ packageConfig({ roots: undefined, entryPoints: [] }) ] }), [
                'invalid value doesn’t match expected union'
            ])
        );

        test(
            'validation fails when checks.noDuplicatedFiles.enabled is missing',
            invalidConfig(configWith({ checks: { noDuplicatedFiles: {} } }), [
                'invalid value doesn’t match expected union'
            ])
        );

        test(
            'validation fails when a per-package noDuplicatedFiles.allowList contains an empty path',
            invalidConfig(configWithEmptyNoDuplicatedFilesAllowList(), [ emptyNoDuplicatedFilesAllowListMessage ])
        );

        test(
            'validation succeeds when a package declares a per-package noDuplicatedFiles allowList',
            validConfig(configWith({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: [ packageConfig({ checks: { noDuplicatedFiles: { allowList: [ 'foo/bar.ts' ] } } }) ]
            }))
        );

        test(
            'validation succeeds and preserves the checks.noDuplicatedFiles settings',
            validConfig(configWith({ checks: { noDuplicatedFiles: { enabled: true } } }))
        );

        test(
            'validation succeeds when commonPackageSettings is defined with all optional values',
            validConfig(configWith({
                commonPackageSettings: {
                    includeSourceMapFiles: true,
                    additionalFiles: [],
                    additionalPackageJsonAttributes: {}
                }
            }))
        );

        test(
            'validation succeeds when commonPackageSettings is not given and a package contains all required settings',
            validConfig(configWith({}))
        );
    });
});
