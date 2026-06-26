import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';

const publicPublishSettings = { access: 'public' } as const;
const packageWithoutPublishSettings = {
    sourcesFolder: 'src',
    mainPackageJson: { type: 'module' },
    name: 'pkg',
    roots: { main: { js: 'index.js' } }
} as const;
const configWithPackageSpecificPublishSettings = {
    commonPackageSettings: {
        sourcesFolder: 'src',
        mainPackageJson: { type: 'module' },
        publishSettings: publicPublishSettings
    },
    packages: [
        {
            name: 'pkg',
            roots: { main: { js: 'index.js' } },
            publishSettings: { access: 'restricted' }
        }
    ]
} as const;

suite('packtory-config-without-registry-schema', function () {
    test('config without registry schema accepts package configs with optional common settings', function () {
        assert.strictEqual(
            safeParse(packtoryConfigWithoutRegistrySchema, {
                packages: [
                    {
                        sourcesFolder: 'src',
                        mainPackageJson: { type: 'module' },
                        name: 'pkg',
                        roots: { main: { js: 'index.js' } },
                        publishSettings: publicPublishSettings
                    }
                ]
            }).success,
            true
        );
    });

    test('config without registry schema accepts required common package settings', function () {
        assert.strictEqual(
            safeParse(packtoryConfigWithoutRegistrySchema, {
                commonPackageSettings: {
                    sourcesFolder: 'src',
                    mainPackageJson: { type: 'module' },
                    publishSettings: publicPublishSettings
                },
                packages: [{ name: 'pkg', roots: { main: { js: 'index.js' } } }]
            }).success,
            true
        );
    });

    test('config without registry schema accepts required mainPackageJson', function () {
        assert.strictEqual(
            safeParse(packtoryConfigWithoutRegistrySchema, {
                commonPackageSettings: { mainPackageJson: { type: 'module' }, publishSettings: publicPublishSettings },
                packages: [{ sourcesFolder: 'src', name: 'pkg', roots: { main: { js: 'index.js' } } }]
            }).success,
            true
        );
    });

    test('config without registry schema accepts required sourcesFolder', function () {
        assert.strictEqual(
            safeParse(packtoryConfigWithoutRegistrySchema, {
                commonPackageSettings: { sourcesFolder: 'src', publishSettings: publicPublishSettings },
                packages: [{ mainPackageJson: { type: 'module' }, name: 'pkg', roots: { main: { js: 'index.js' } } }]
            }).success,
            true
        );
    });

    test('config without registry schema rejects an empty packages tuple', function () {
        assert.strictEqual(safeParse(packtoryConfigWithoutRegistrySchema, { packages: [] }).success, false);
    });

    test('required common settings branch rejects an empty packages tuple', function () {
        assert.strictEqual(
            safeParse(packtoryConfigWithoutRegistrySchema, {
                commonPackageSettings: {
                    sourcesFolder: 'src',
                    mainPackageJson: { type: 'module' },
                    publishSettings: publicPublishSettings
                },
                packages: []
            }).success,
            false
        );
    });

    test('required mainPackageJson branch rejects an empty packages tuple', function () {
        assert.strictEqual(
            safeParse(packtoryConfigWithoutRegistrySchema, {
                commonPackageSettings: { mainPackageJson: { type: 'module' }, publishSettings: publicPublishSettings },
                packages: []
            }).success,
            false
        );
    });

    test('required sourcesFolder branch rejects an empty packages tuple', function () {
        assert.strictEqual(
            safeParse(packtoryConfigWithoutRegistrySchema, {
                commonPackageSettings: { sourcesFolder: 'src', publishSettings: publicPublishSettings },
                packages: []
            }).success,
            false
        );
    });

    test(
        'config without registry: validation succeeds for the optional-common-settings branch',
        checkValidationSuccess({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                packages: [
                    {
                        sourcesFolder: 'src',
                        mainPackageJson: { type: 'module' },
                        name: 'pkg',
                        roots: { main: { js: 'index.js' } },
                        publishSettings: publicPublishSettings
                    }
                ]
            },
            expectedData: {
                packages: [
                    {
                        sourcesFolder: 'src',
                        mainPackageJson: { type: 'module' },
                        name: 'pkg',
                        roots: { main: { js: 'index.js' } },
                        publishSettings: publicPublishSettings
                    }
                ]
            }
        })
    );

    test(
        'config without registry: validation succeeds for the required-common-settings branch',
        checkValidationSuccess({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                commonPackageSettings: {
                    sourcesFolder: 'src',
                    mainPackageJson: { type: 'module' },
                    publishSettings: publicPublishSettings
                },
                packages: [{ name: 'pkg', roots: { main: { js: 'index.js' } } }]
            },
            expectedData: {
                commonPackageSettings: {
                    sourcesFolder: 'src',
                    mainPackageJson: { type: 'module' },
                    publishSettings: publicPublishSettings
                },
                packages: [{ name: 'pkg', roots: { main: { js: 'index.js' } } }]
            }
        })
    );

    test(
        'config without registry: validation succeeds for the required-main-package-json branch',
        checkValidationSuccess({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                commonPackageSettings: { mainPackageJson: { type: 'module' }, publishSettings: publicPublishSettings },
                packages: [{ sourcesFolder: 'src', name: 'pkg', roots: { main: { js: 'index.js' } } }]
            },
            expectedData: {
                commonPackageSettings: { mainPackageJson: { type: 'module' }, publishSettings: publicPublishSettings },
                packages: [{ sourcesFolder: 'src', name: 'pkg', roots: { main: { js: 'index.js' } } }]
            }
        })
    );

    test(
        'config without registry: validation succeeds for the required-sources-folder branch',
        checkValidationSuccess({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                commonPackageSettings: { sourcesFolder: 'src', publishSettings: publicPublishSettings },
                packages: [{ mainPackageJson: { type: 'module' }, name: 'pkg', roots: { main: { js: 'index.js' } } }]
            },
            expectedData: {
                commonPackageSettings: { sourcesFolder: 'src', publishSettings: publicPublishSettings },
                packages: [{ mainPackageJson: { type: 'module' }, name: 'pkg', roots: { main: { js: 'index.js' } } }]
            }
        })
    );

    test(
        'config without registry: union validation fails when packages is empty',
        checkValidationFailure({
            schema: packtoryConfigWithoutRegistrySchema,
            data: { packages: [] },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'config without registry: validation succeeds when per-package publishSettings overrides the common default',
        checkValidationSuccess({
            schema: packtoryConfigWithoutRegistrySchema,
            data: configWithPackageSpecificPublishSettings,
            expectedData: configWithPackageSpecificPublishSettings
        })
    );

    test(
        'config without registry: schema accepts a config without publishSettings (placement is enforced in validateConfig)',
        checkValidationSuccess({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                packages: [packageWithoutPublishSettings]
            },
            expectedData: {
                packages: [packageWithoutPublishSettings]
            }
        })
    );
});
