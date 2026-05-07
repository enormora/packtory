import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';

const publicPublishSettings = { access: 'public' } as const;

test('config without registry schema accepts package configs with optional common settings', () => {
    assert.strictEqual(
        safeParse(packtoryConfigWithoutRegistrySchema, {
            packages: [
                {
                    sourcesFolder: 'src',
                    mainPackageJson: {},
                    name: 'pkg',
                    entryPoints: [{ js: 'index.js' }],
                    publishSettings: publicPublishSettings
                }
            ]
        }).success,
        true
    );
});

test('config without registry schema accepts required common package settings', () => {
    assert.strictEqual(
        safeParse(packtoryConfigWithoutRegistrySchema, {
            commonPackageSettings: {
                sourcesFolder: 'src',
                mainPackageJson: {},
                publishSettings: publicPublishSettings
            },
            packages: [{ name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
        }).success,
        true
    );
});

test('config without registry schema accepts required mainPackageJson', () => {
    assert.strictEqual(
        safeParse(packtoryConfigWithoutRegistrySchema, {
            commonPackageSettings: { mainPackageJson: {}, publishSettings: publicPublishSettings },
            packages: [{ sourcesFolder: 'src', name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
        }).success,
        true
    );
});

test('config without registry schema accepts required sourcesFolder', () => {
    assert.strictEqual(
        safeParse(packtoryConfigWithoutRegistrySchema, {
            commonPackageSettings: { sourcesFolder: 'src', publishSettings: publicPublishSettings },
            packages: [{ mainPackageJson: {}, name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
        }).success,
        true
    );
});

test('config without registry schema rejects an empty packages tuple', () => {
    assert.strictEqual(safeParse(packtoryConfigWithoutRegistrySchema, { packages: [] }).success, false);
});

test('required common settings branch rejects an empty packages tuple', () => {
    assert.strictEqual(
        safeParse(packtoryConfigWithoutRegistrySchema, {
            commonPackageSettings: {
                sourcesFolder: 'src',
                mainPackageJson: {},
                publishSettings: publicPublishSettings
            },
            packages: []
        }).success,
        false
    );
});

test('required mainPackageJson branch rejects an empty packages tuple', () => {
    assert.strictEqual(
        safeParse(packtoryConfigWithoutRegistrySchema, {
            commonPackageSettings: { mainPackageJson: {}, publishSettings: publicPublishSettings },
            packages: []
        }).success,
        false
    );
});

test('required sourcesFolder branch rejects an empty packages tuple', () => {
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
                    mainPackageJson: {},
                    name: 'pkg',
                    entryPoints: [{ js: 'index.js' }],
                    publishSettings: publicPublishSettings
                }
            ]
        },
        expectedData: {
            packages: [
                {
                    sourcesFolder: 'src',
                    mainPackageJson: {},
                    name: 'pkg',
                    entryPoints: [{ js: 'index.js' }],
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
                mainPackageJson: {},
                publishSettings: publicPublishSettings
            },
            packages: [{ name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
        },
        expectedData: {
            commonPackageSettings: {
                sourcesFolder: 'src',
                mainPackageJson: {},
                publishSettings: publicPublishSettings
            },
            packages: [{ name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
        }
    })
);

test(
    'config without registry: validation succeeds for the required-main-package-json branch',
    checkValidationSuccess({
        schema: packtoryConfigWithoutRegistrySchema,
        data: {
            commonPackageSettings: { mainPackageJson: {}, publishSettings: publicPublishSettings },
            packages: [{ sourcesFolder: 'src', name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
        },
        expectedData: {
            commonPackageSettings: { mainPackageJson: {}, publishSettings: publicPublishSettings },
            packages: [{ sourcesFolder: 'src', name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
        }
    })
);

test(
    'config without registry: validation succeeds for the required-sources-folder branch',
    checkValidationSuccess({
        schema: packtoryConfigWithoutRegistrySchema,
        data: {
            commonPackageSettings: { sourcesFolder: 'src', publishSettings: publicPublishSettings },
            packages: [{ mainPackageJson: {}, name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
        },
        expectedData: {
            commonPackageSettings: { sourcesFolder: 'src', publishSettings: publicPublishSettings },
            packages: [{ mainPackageJson: {}, name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
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
        data: {
            commonPackageSettings: {
                sourcesFolder: 'src',
                mainPackageJson: {},
                publishSettings: publicPublishSettings
            },
            packages: [
                {
                    name: 'pkg',
                    entryPoints: [{ js: 'index.js' }],
                    publishSettings: { access: 'restricted' }
                }
            ]
        },
        expectedData: {
            commonPackageSettings: {
                sourcesFolder: 'src',
                mainPackageJson: {},
                publishSettings: publicPublishSettings
            },
            packages: [
                {
                    name: 'pkg',
                    entryPoints: [{ js: 'index.js' }],
                    publishSettings: { access: 'restricted' }
                }
            ]
        }
    })
);

test(
    'config without registry: schema accepts a config without publishSettings (placement is enforced in validateConfig)',
    checkValidationSuccess({
        schema: packtoryConfigWithoutRegistrySchema,
        data: {
            packages: [{ sourcesFolder: 'src', mainPackageJson: {}, name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
        },
        expectedData: {
            packages: [{ sourcesFolder: 'src', mainPackageJson: {}, name: 'pkg', entryPoints: [{ js: 'index.js' }] }]
        }
    })
);
