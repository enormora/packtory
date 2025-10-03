import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { packtoryConfigSchema } from './config.ts';

test('validation succeeds when commonPackageSettings is defined but empty', checkValidationSuccess, {
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
    }
});

test('validation succeeds when commonPackageSettings is defined with all optional values', checkValidationSuccess, {
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
    }
});
test(
    'validation succeeds when commonPackageSettings is not given and a package contains all required settings',
    checkValidationSuccess,
    {
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
        }
    }
);

test(
    'validation succeeds when commonPackageSettings is given and a package contains no common settings',
    checkValidationSuccess,
    {
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
        }
    }
);

test(
    'validation succeeds when commonPackageSettings is given and a package contains common settings as well',
    checkValidationSuccess,
    {
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
        }
    }
);

test('validation succeeds when only sourcesFolder is provided in commonPackageSettings', checkValidationSuccess, {
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
    }
});

test(
    'validation succeeds when only sourcesFolder is provided in commonPackageSettings and in packages',
    checkValidationSuccess,
    {
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
        }
    }
);

test('validation succeeds when only mainPackageJson is provided in commonPackageSettings', checkValidationSuccess, {
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
    }
});

test(
    'validation succeeds when only mainPackageJson is provided in commonPackageSettings and in packages',
    checkValidationSuccess,
    {
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
        }
    }
);

test('validation succeeds when all optional properties are given', checkValidationSuccess, {
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
    }
});

test('validation fails when a non-object is given', checkValidationFailure, {
    schema: packtoryConfigSchema,
    data: true,
    expectedMessages: ['expected object, but got boolean', 'invalid value: expected object, but got boolean']
});

test('validation fails when an empty object is given', checkValidationFailure, {
    schema: packtoryConfigSchema,
    data: {},
    expectedMessages: ['at registrySettings: missing property', 'invalid value doesn’t match expected union']
});

test(
    'validation fails when commonPackageSettings is not defined and mainPackageJson is missing in a package',
    checkValidationFailure,
    {
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
    }
);

test('validation fails when packages is an empty array', checkValidationFailure, {
    schema: packtoryConfigSchema,
    data: {
        registrySettings: { token: 'foo' },
        packages: []
    },
    expectedMessages: ['invalid value doesn’t match expected union']
});

test(
    'validation fails when commonPackageSettings is empty and packages don’t define required properties',
    checkValidationFailure,
    {
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
    }
);

test('validation fails when commonPackageSettings contains only mainPackageJson', checkValidationFailure, {
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
});

test(
    'validation fails when commonPackageSettings is undefined and sourcesFolder is missing in a package',
    checkValidationFailure,
    {
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
    }
);

test('validation fails when commonPackageSettings contains only sourcesFolder', checkValidationFailure, {
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
});

test('validation fails when name is missing in a package', checkValidationFailure, {
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
});

test('validation fails when name is not a string', checkValidationFailure, {
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
});

test('validation fails when entryPoints is missing in a package', checkValidationFailure, {
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
});

test('validation fails when entryPoints is not an array', checkValidationFailure, {
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
});

test('validation fails when entryPoints is an empty array', checkValidationFailure, {
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
});

test('validation fails when entryPoints item is invalid', checkValidationFailure, {
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
});

test('validation fails when additionalFiles is not an array', checkValidationFailure, {
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
});

test('validation fails when includeSourceMapFiles is not a boolean', checkValidationFailure, {
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
});

test('validation fails when additionalPackageJsonAttributes is not an object', checkValidationFailure, {
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
});

test('validation fails when versioning is not an object', checkValidationFailure, {
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
});

test('validation fails when bundleDependencies is not an array', checkValidationFailure, {
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
});

test('validation fails when bundlePeerDependencies is not an array', checkValidationFailure, {
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
});
