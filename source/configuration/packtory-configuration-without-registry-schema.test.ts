import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { packtoryConfigurationWithoutRegistrySchema } from './packtory-configuration-without-registry-schema.ts';

const publicPublishSettings = { access: 'public' } as const;
const packageWithoutPublishSettings = {
    sourcesFolder: 'source',
    mainPackageManifest: { type: 'module' },
    name: 'package',
    roots: { main: { javaScript: 'index.js' } }
} as const;
const configurationWithPackageSpecificPublishSettings = {
    commonPackageSettings: {
        sourcesFolder: 'source',
        mainPackageManifest: { type: 'module' },
        publishSettings: publicPublishSettings
    },
    packages: [
        {
            name: 'package',
            roots: { main: { javaScript: 'index.js' } },
            publishSettings: { access: 'restricted' }
        }
    ]
} as const;

suite('packtory-config-without-registry-schema', function () {
    suite('config without registry common settings', function () {
        test('config without registry schema accepts package configs with optional common settings', function () {
            assert.strictEqual(
                safeParse(packtoryConfigurationWithoutRegistrySchema, {
                    packages: [
                        {
                            sourcesFolder: 'source',
                            mainPackageManifest: { type: 'module' },
                            name: 'package',
                            roots: { main: { javaScript: 'index.js' } },
                            publishSettings: publicPublishSettings
                        }
                    ]
                })
                    .success,
                true
            );
        });

        test('config without registry schema accepts required common package settings', function () {
            assert.strictEqual(
                safeParse(packtoryConfigurationWithoutRegistrySchema, {
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        publishSettings: publicPublishSettings
                    },
                    packages: [ { name: 'package', roots: { main: { javaScript: 'index.js' } } } ]
                })
                    .success,
                true
            );
        });

        test('config without registry schema accepts required mainPackageManifest', function () {
            assert.strictEqual(
                safeParse(packtoryConfigurationWithoutRegistrySchema, {
                    commonPackageSettings: {
                        mainPackageManifest: { type: 'module' },
                        publishSettings: publicPublishSettings
                    },
                    packages: [ {
                        sourcesFolder: 'source',
                        name: 'package',
                        roots: { main: { javaScript: 'index.js' } }
                    } ]
                })
                    .success,
                true
            );
        });

        test('config without registry schema accepts required sourcesFolder', function () {
            assert.strictEqual(
                safeParse(packtoryConfigurationWithoutRegistrySchema, {
                    commonPackageSettings: { sourcesFolder: 'source', publishSettings: publicPublishSettings },
                    packages: [ {
                        mainPackageManifest: { type: 'module' },
                        name: 'package',
                        roots: { main: { javaScript: 'index.js' } }
                    } ]
                })
                    .success,
                true
            );
        });

        test('config without registry schema rejects an empty packages tuple', function () {
            assert.strictEqual(safeParse(packtoryConfigurationWithoutRegistrySchema, { packages: [] }).success, false);
        });

        test('required common settings branch rejects an empty packages tuple', function () {
            assert.strictEqual(
                safeParse(packtoryConfigurationWithoutRegistrySchema, {
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        publishSettings: publicPublishSettings
                    },
                    packages: []
                })
                    .success,
                false
            );
        });

        test('required mainPackageManifest branch rejects an empty packages tuple', function () {
            assert.strictEqual(
                safeParse(packtoryConfigurationWithoutRegistrySchema, {
                    commonPackageSettings: {
                        mainPackageManifest: { type: 'module' },
                        publishSettings: publicPublishSettings
                    },
                    packages: []
                })
                    .success,
                false
            );
        });

        test('required sourcesFolder branch rejects an empty packages tuple', function () {
            assert.strictEqual(
                safeParse(packtoryConfigurationWithoutRegistrySchema, {
                    commonPackageSettings: { sourcesFolder: 'source', publishSettings: publicPublishSettings },
                    packages: []
                })
                    .success,
                false
            );
        });
    });

    suite('config without registry validation failures', function () {
        test(
            'config without registry: validation succeeds for the optional-common-settings branch',
            checkValidationSuccess({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    packages: [
                        {
                            sourcesFolder: 'source',
                            mainPackageManifest: { type: 'module' },
                            name: 'package',
                            roots: { main: { javaScript: 'index.js' } },
                            publishSettings: publicPublishSettings
                        }
                    ]
                },
                expectedData: {
                    packages: [
                        {
                            sourcesFolder: 'source',
                            mainPackageManifest: { type: 'module' },
                            name: 'package',
                            roots: { main: { javaScript: 'index.js' } },
                            publishSettings: publicPublishSettings
                        }
                    ]
                }
            })
        );

        test(
            'config without registry: validation succeeds for the required-common-settings branch',
            checkValidationSuccess({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        publishSettings: publicPublishSettings
                    },
                    packages: [ { name: 'package', roots: { main: { javaScript: 'index.js' } } } ]
                },
                expectedData: {
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        publishSettings: publicPublishSettings
                    },
                    packages: [ { name: 'package', roots: { main: { javaScript: 'index.js' } } } ]
                }
            })
        );

        test(
            'config without registry: validation succeeds for the required-main-package-json branch',
            checkValidationSuccess({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    commonPackageSettings: {
                        mainPackageManifest: { type: 'module' },
                        publishSettings: publicPublishSettings
                    },
                    packages: [ {
                        sourcesFolder: 'source',
                        name: 'package',
                        roots: { main: { javaScript: 'index.js' } }
                    } ]
                },
                expectedData: {
                    commonPackageSettings: {
                        mainPackageManifest: { type: 'module' },
                        publishSettings: publicPublishSettings
                    },
                    packages: [ {
                        sourcesFolder: 'source',
                        name: 'package',
                        roots: { main: { javaScript: 'index.js' } }
                    } ]
                }
            })
        );

        test(
            'config without registry: validation succeeds for the required-sources-folder branch',
            checkValidationSuccess({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    commonPackageSettings: { sourcesFolder: 'source', publishSettings: publicPublishSettings },
                    packages: [ {
                        mainPackageManifest: { type: 'module' },
                        name: 'package',
                        roots: { main: { javaScript: 'index.js' } }
                    } ]
                },
                expectedData: {
                    commonPackageSettings: { sourcesFolder: 'source', publishSettings: publicPublishSettings },
                    packages: [ {
                        mainPackageManifest: { type: 'module' },
                        name: 'package',
                        roots: { main: { javaScript: 'index.js' } }
                    } ]
                }
            })
        );

        test(
            'config without registry: union validation fails when packages is empty',
            checkValidationFailure({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: { packages: [] },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'config without registry: validation succeeds when per-package publishSettings overrides the common default',
            checkValidationSuccess({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: configurationWithPackageSpecificPublishSettings,
                expectedData: configurationWithPackageSpecificPublishSettings
            })
        );

        test(
            'config without registry: schema accepts a config without publishSettings (placement is enforced in validateConfiguration)',
            checkValidationSuccess({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    packages: [ packageWithoutPublishSettings ]
                },
                expectedData: {
                    packages: [ packageWithoutPublishSettings ]
                }
            })
        );
    });
});
