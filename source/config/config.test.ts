import assert from 'node:assert';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { bundledDependencyPropertyNames, getBundledDependencies } from './config.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';

test('bundled dependency property names are exposed as runtime constants', () => {
    assert.deepStrictEqual(bundledDependencyPropertyNames, ['bundleDependencies', 'bundlePeerDependencies']);
});

test('getBundledDependencies combines direct and peer bundled dependencies', () => {
    assert.deepStrictEqual(
        getBundledDependencies({
            name: 'foo',
            entryPoints: [{ js: 'foo.js' }],
            bundleDependencies: ['bar'],
            bundlePeerDependencies: ['baz']
        }),
        ['bar', 'baz']
    );
});

test('getBundledDependencies returns an empty list when no bundled dependencies are defined', () => {
    assert.deepStrictEqual(
        getBundledDependencies({
            name: 'foo',
            entryPoints: [{ js: 'foo.js' }]
        }),
        []
    );
});

test('config schema accepts a valid config', () => {
    assert.strictEqual(
        packtoryConfigSchema.safeParse({
            registrySettings: { token: 'foo' },
            packages: [{ sourcesFolder: 'source', mainPackageJson: {}, name: 'foo', entryPoints: [{ js: 'foo' }] }]
        }).success,
        true
    );
});

test('config schema rejects configs without registrySettings', () => {
    assert.strictEqual(
        packtoryConfigSchema.safeParse({
            packages: [{ sourcesFolder: 'source', mainPackageJson: {}, name: 'foo', entryPoints: [{ js: 'foo' }] }]
        }).success,
        false
    );
});

test('config without registry schema rejects an empty packages tuple', () => {
    assert.strictEqual(packtoryConfigWithoutRegistrySchema.safeParse({ packages: [] }).success, false);
});

test(
    'validation succeeds when commonPackageSettings is defined but empty',
    checkValidationSuccess({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: {},
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: {},
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        }
    })
);

test(
    'validation fails when registrySettings is missing',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedMessages: ['at registrySettings: missing property']
    })
);

test(
    'validation fails when packages is an empty array',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            packages: []
        },
        expectedMessages: ['invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when a package entryPoints array is empty',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
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
            registrySettings: { token: 'foo' },
            checks: {
                noDuplicatedFiles: {
                    allowList: ['foo/bar.ts']
                }
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedMessages: ['invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when checks.noDuplicatedFiles.allowList contains an empty path',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            checks: {
                noDuplicatedFiles: {
                    enabled: true,
                    allowList: ['']
                }
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedMessages: ['at checks.noDuplicatedFiles.allowList[0]: string must contain at least 1 character']
    })
);

test(
    'validation succeeds when checks.noDuplicatedFiles specifies an allow list',
    checkValidationSuccess({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            checks: {
                noDuplicatedFiles: {
                    enabled: true,
                    allowList: ['foo/bar.ts']
                }
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            checks: {
                noDuplicatedFiles: {
                    enabled: true,
                    allowList: ['foo/bar.ts']
                }
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            checks: {
                noDuplicatedFiles: {
                    enabled: true,
                    allowList: ['foo/bar.ts']
                }
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            checks: {
                noDuplicatedFiles: {
                    enabled: true,
                    allowList: ['foo/bar.ts']
                }
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                includeSourceMapFiles: true,
                additionalFiles: [],
                additionalPackageJsonAttributes: {}
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                includeSourceMapFiles: true,
                additionalFiles: [],
                additionalPackageJsonAttributes: {}
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {}
            },
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {}
            },
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {}
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {}
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source'
            },
            packages: [
                {
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source'
            },
            packages: [
                {
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source'
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source'
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                mainPackageJson: {}
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                mainPackageJson: {}
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                mainPackageJson: {}
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedData: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                mainPackageJson: {}
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {},
                additionalFiles: [{ sourceFilePath: 'foo', targetFilePath: 'foo' }],
                includeSourceMapFiles: true,
                additionalPackageJsonAttributes: { license: 'foo' }
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }],
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {},
                additionalFiles: [{ sourceFilePath: 'foo', targetFilePath: 'foo' }],
                includeSourceMapFiles: true,
                additionalPackageJsonAttributes: { license: 'foo' }
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }],
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
        expectedMessages: ['at registrySettings: missing property', 'invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when commonPackageSettings is not defined and mainPackageJson is missing in a package',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'source',
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedMessages: ['invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when packages is an empty array',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            packages: []
        },
        expectedMessages: ['invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when entryPoints is an empty array',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: []
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
            registrySettings: { token: 'foo' },
            checks: {
                noDuplicatedFiles: {
                    allowList: ['foo/bar.ts']
                }
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedMessages: ['invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when checks.noDuplicatedFiles.allowList contains an empty path',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            checks: {
                noDuplicatedFiles: {
                    enabled: true,
                    allowList: ['']
                }
            },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedMessages: ['at checks.noDuplicatedFiles.allowList[0]: string must contain at least 1 character']
    })
);

test(
    'validation fails when commonPackageSettings is empty and packages don’t define required properties',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: {},
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                mainPackageJson: {}
            },
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: undefined,
            packages: [
                {
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'foo'
            },
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'foo',
                    mainPackageJson: {},
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'foo',
                    mainPackageJson: {},
                    name: 42,
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedMessages: ['invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when entryPoints is missing in a package',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'foo',
                    mainPackageJson: {},
                    name: 'foo'
                }
            ]
        },
        expectedMessages: ['invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when entryPoints is not an array',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'foo',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: 'foo'
                }
            ]
        },
        expectedMessages: ['invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when entryPoints is an empty array',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'foo',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: []
                }
            ]
        },
        expectedMessages: ['invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when entryPoints item is invalid',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            packages: [
                {
                    sourcesFolder: 'foo',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ foo: 'bar' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {},
                additionalFiles: 'foo'
            },
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {},
                includeSourceMapFiles: 'foo'
            },
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {},
                additionalPackageJsonAttributes: 'foo'
            },
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {}
            },
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }],
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {}
            },
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }],
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
            registrySettings: { token: 'foo' },
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageJson: {}
            },
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }],
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
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'index.js' }]
                }
            ]
        },
        expectedData: {
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'index.js' }]
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
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'index.js' }]
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
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'index.js' }]
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
            packages: [{ name: 'foo', entryPoints: [{ js: 'index.js' }] }]
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
                mainPackageJson: {},
                additionalPackageJsonAttributes: { dependencies: '1.0.0' }
            },
            packages: [{ name: 'foo', entryPoints: [{ js: 'index.js' }] }]
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
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'index.js' }],
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
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'index.js' }],
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
            registrySettings: { token: 42 },
            packages: [
                {
                    sourcesFolder: 'source',
                    mainPackageJson: {},
                    name: 'foo',
                    entryPoints: [{ js: 'index.js' }]
                }
            ]
        },
        expectedMessages: ['at registrySettings.token: expected string, but got number']
    })
);
