import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { suite, test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { getBundledDependencies } from './config.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';

suite('config', function () {
    test('getBundledDependencies combines direct and peer bundled dependencies', function () {
        assert.deepStrictEqual(
            getBundledDependencies({
                bundleDependencies: ['bar'],
                bundlePeerDependencies: ['baz']
            }),
            ['bar', 'baz']
        );
    });

    test('getBundledDependencies returns an empty list when no bundled dependencies are defined', function () {
        assert.deepStrictEqual(getBundledDependencies({}), []);
    });

    test('config schema accepts a valid config', function () {
        assert.strictEqual(
            safeParse(packtoryConfigSchema, {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }).success,
            true
        );
    });

    test('config schema accepts configs without registrySettings', function () {
        assert.strictEqual(
            safeParse(packtoryConfigSchema, {
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }).success,
            true
        );
    });

    test('config without registry schema rejects an empty packages tuple', function () {
        assert.strictEqual(safeParse(packtoryConfigWithoutRegistrySchema, { packages: [] }).success, false);
    });

    test(
        'validation succeeds when commonPackageSettings is defined but empty',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {},
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {},
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when registrySettings is omitted',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when registrySettings is provided without auth',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { registryUrl: 'https://registry.example' },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation fails when packages is an empty array',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: []
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when a package supplies entryPoints instead of roots',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        entryPoints: []
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when checks.noDuplicatedFiles.enabled is missing',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                checks: {
                    noDuplicatedFiles: {}
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when a per-package noDuplicatedFiles.allowList contains an empty path',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                checks: {
                    noDuplicatedFiles: {
                        enabled: true
                    }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        checks: { noDuplicatedFiles: { allowList: [''] } }
                    }
                ]
            },
            expectedMessages: [
                'at packages[0].checks.noDuplicatedFiles.allowList[0]: string must contain at least 1 character'
            ]
        })
    );

    test(
        'validation succeeds when a package declares a per-package noDuplicatedFiles allowList',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                checks: {
                    noDuplicatedFiles: { enabled: true }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        checks: { noDuplicatedFiles: { allowList: ['foo/bar.ts'] } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                checks: {
                    noDuplicatedFiles: { enabled: true }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        checks: { noDuplicatedFiles: { allowList: ['foo/bar.ts'] } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds and preserves the checks.noDuplicatedFiles settings',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                checks: {
                    noDuplicatedFiles: { enabled: true }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                checks: {
                    noDuplicatedFiles: { enabled: true }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when commonPackageSettings is defined with all optional values',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    includeSourceMapFiles: true,
                    additionalFiles: [],
                    additionalPackageJsonAttributes: {}
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    includeSourceMapFiles: true,
                    additionalFiles: [],
                    additionalPackageJsonAttributes: {}
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when commonPackageSettings is not given and a package contains all required settings',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when commonPackageSettings is given and a package contains no common settings',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when commonPackageSettings is given and a package contains common settings as well',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when only sourcesFolder is provided in commonPackageSettings',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source'
                },
                packages: [
                    {
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source'
                },
                packages: [
                    {
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when only sourcesFolder is provided in commonPackageSettings and in packages',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source'
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source'
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when only mainPackageJson is provided in commonPackageSettings',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when only mainPackageJson is provided in commonPackageSettings and in packages',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            }
        })
    );

    test(
        'validation succeeds when all optional properties are given',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' },
                    additionalFiles: [{ sourceFilePath: 'foo', targetFilePath: 'foo' }],
                    includeSourceMapFiles: true,
                    additionalPackageJsonAttributes: { license: 'foo' }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        versioning: { automatic: true },
                        bundleDependencies: ['foo'],
                        bundlePeerDependencies: ['foo'],
                        additionalFiles: [{ sourceFilePath: 'foo', targetFilePath: 'foo' }],
                        includeSourceMapFiles: true,
                        additionalPackageJsonAttributes: { license: 'foo' }
                    }
                ]
            },
            expectedData: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' },
                    additionalFiles: [{ sourceFilePath: 'foo', targetFilePath: 'foo' }],
                    includeSourceMapFiles: true,
                    additionalPackageJsonAttributes: { license: 'foo' }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        versioning: { automatic: true },
                        bundleDependencies: ['foo'],
                        bundlePeerDependencies: ['foo'],
                        additionalFiles: [{ sourceFilePath: 'foo', targetFilePath: 'foo' }],
                        includeSourceMapFiles: true,
                        additionalPackageJsonAttributes: { license: 'foo' }
                    }
                ]
            }
        })
    );

    test(
        'validation fails when a non-object is given',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: true,
            expectedMessages: ['expected object, but got boolean', 'invalid value: expected object, but got boolean']
        })
    );

    test(
        'validation fails when an empty object is given',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {},
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when commonPackageSettings is not defined and mainPackageJson is missing in a package',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: [
                    {
                        sourcesFolder: 'source',
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when checks.noDuplicatedFiles misses the enabled flag',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                checks: {
                    noDuplicatedFiles: {}
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when a per-package noDuplicatedFiles.allowList contains an empty path (registry config)',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                checks: {
                    noDuplicatedFiles: { enabled: true }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        checks: { noDuplicatedFiles: { allowList: [''] } }
                    }
                ]
            },
            expectedMessages: [
                'at packages[0].checks.noDuplicatedFiles.allowList[0]: string must contain at least 1 character'
            ]
        })
    );

    test(
        'validation fails when commonPackageSettings is empty and packages don’t define required properties',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {},
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when commonPackageSettings contains only mainPackageJson',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when commonPackageSettings is undefined and sourcesFolder is missing in a package',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: undefined,
                packages: [
                    {
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when commonPackageSettings contains only sourcesFolder',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'foo'
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when name is missing in a package',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: [
                    {
                        sourcesFolder: 'foo',
                        mainPackageJson: { type: 'module' },
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when name is not a string',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: [
                    {
                        sourcesFolder: 'foo',
                        mainPackageJson: { type: 'module' },
                        name: 42,
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when roots is missing in a package',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: [
                    {
                        sourcesFolder: 'foo',
                        mainPackageJson: { type: 'module' },
                        name: 'foo'
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when roots is not an object',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: [
                    {
                        sourcesFolder: 'foo',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: 'foo'
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when a root entry is invalid',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                packages: [
                    {
                        sourcesFolder: 'foo',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { foo: 'bar' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when additionalFiles is not an array',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' },
                    additionalFiles: 'foo'
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when includeSourceMapFiles is not a boolean',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' },
                    includeSourceMapFiles: 'foo'
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when additionalPackageJsonAttributes is not an object',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' },
                    additionalPackageJsonAttributes: 'foo'
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when versioning is not an object',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        versioning: 'foo'
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when bundleDependencies is not an array',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        bundleDependencies: 'foo'
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation fails when bundlePeerDependencies is not an array',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' }
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        bundlePeerDependencies: 'foo'
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation without registry succeeds for a minimal package config',
        checkValidationSuccess({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'index.js' } }
                    }
                ]
            },
            expectedData: {
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'index.js' } }
                    }
                ]
            }
        })
    );

    test(
        'validation without registry fails when checks is not an object',
        checkValidationFailure({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                checks: 'foo',
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'index.js' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation without registry fails when commonPackageSettings is not an object',
        checkValidationFailure({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                commonPackageSettings: 'foo',
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'index.js' } }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation without registry fails when a package entry is not an object',
        checkValidationFailure({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                packages: ['foo']
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation prefixes common package.json issues with commonPackageSettings',
        checkValidationFailure({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { dependencies: true }
                },
                packages: [{ name: 'foo', roots: { main: { js: 'index.js' } } }]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation prefixes common additional package.json attribute issues with commonPackageSettings',
        checkValidationFailure({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' },
                    additionalPackageJsonAttributes: { dependencies: '1.0.0' }
                },
                packages: [{ name: 'foo', roots: { main: { js: 'index.js' } } }]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation prefixes package additionalFiles issues with the array entry path',
        checkValidationFailure({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'index.js' } },
                        additionalFiles: [{ sourceFilePath: 'asset.txt' }]
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation prefixes package additional package.json attribute issues',
        checkValidationFailure({
            schema: packtoryConfigWithoutRegistrySchema,
            data: {
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'index.js' } },
                        additionalPackageJsonAttributes: { version: '1.0.0' }
                    }
                ]
            },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'validation prefixes registry settings issues with registrySettings',
        checkValidationFailure({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: {
                    auth: { type: 'bearer-token', token: 42 }
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'index.js' } }
                    }
                ]
            },
            expectedMessages: ['at registrySettings.auth: invalid value doesn’t match expected union']
        })
    );
});
