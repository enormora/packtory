import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.js';
import { packtoryConfigSchema } from './config.js';

test('validation succeeds when valid data without commonPackageSettings is given', checkValidationSuccess, {
    schema: packtoryConfigSchema,
    data: {
        registrySettings: { token: 'foo' },
        packages: []
    }
});

test('validation succeeds when commonPackageSettings is undefined', checkValidationSuccess, {
    schema: packtoryConfigSchema,
    data: {
        registrySettings: { token: 'foo' },
        commonPackageSettings: undefined,
        packages: []
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
    expectedMessages: ['Expected object; but got boolean']
});

test('validation fails when an empty object is given', checkValidationFailure, {
    schema: packtoryConfigSchema,
    data: {},
    expectedMessages: [
        'At registrySettings: missing key or index',
        'At packages: missing key or index',
        'At commonPackageSettings: missing key or index'
    ]
});

test(
    'validation fails when commonPackageSettings is undefined and mainPackageJson is missing in a package',
    checkValidationFailure,
    {
        schema: packtoryConfigSchema,
        data: {
            registrySettings: { token: 'foo' },
            commonPackageSettings: undefined,
            packages: [
                {
                    sourcesFolder: 'source',
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }]
                }
            ]
        },
        expectedMessages: [
            'At packages.0.mainPackageJson: missing key or index',
            'At commonPackageSettings: expected object; but got undefined'
        ]
    }
);

test('validation fails when commonPackageSettings is empty', checkValidationFailure, {
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
    expectedMessages: [
        'At commonPackageSettings: expected undefined; but got object',
        'At packages.0.sourcesFolder: missing key or index',
        'At packages.0.mainPackageJson: missing key or index',
        'At commonPackageSettings.sourcesFolder: missing key or index',
        'At commonPackageSettings.mainPackageJson: missing key or index'
    ]
});

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
    expectedMessages: [
        'At commonPackageSettings: expected undefined; but got object',
        'At packages.0.sourcesFolder: missing key or index',
        'At packages.0.mainPackageJson: missing key or index',
        'At commonPackageSettings.sourcesFolder: missing key or index'
    ]
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
        expectedMessages: [
            'At packages.0.sourcesFolder: missing key or index',
            'At commonPackageSettings: expected object; but got undefined'
        ]
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
    expectedMessages: [
        'At commonPackageSettings: expected undefined; but got object',
        'At packages.0.sourcesFolder: missing key or index',
        'At packages.0.mainPackageJson: missing key or index',
        'At commonPackageSettings.mainPackageJson: missing key or index'
    ]
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
    expectedMessages: ['At packages.0.name: missing key or index', 'At commonPackageSettings: missing key or index']
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
    expectedMessages: [
        'At packages.0.name: expected string; but got number',
        'At commonPackageSettings: missing key or index'
    ]
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
    expectedMessages: [
        'At packages.0.entryPoints: missing key or index',
        'At commonPackageSettings: missing key or index'
    ]
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
    expectedMessages: [
        'At packages.0.entryPoints: expected array; but got string',
        'At commonPackageSettings: missing key or index'
    ]
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
    expectedMessages: [
        'At packages.0.entryPoints: expected an array of at least 1 items; but got array',
        'At commonPackageSettings: missing key or index'
    ]
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
    expectedMessages: [
        'At packages.0.entryPoints.0.foo: unexpected extra key or index',
        'At packages.0.entryPoints.0.js: missing key or index',
        'At commonPackageSettings: missing key or index'
    ]
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
    expectedMessages: [
        'At commonPackageSettings: expected undefined; but got object',
        'At packages.0.sourcesFolder: missing key or index',
        'At packages.0.mainPackageJson: missing key or index',
        'At commonPackageSettings.additionalFiles: expected array; but got string'
    ]
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
    expectedMessages: [
        'At commonPackageSettings: expected undefined; but got object',
        'At packages.0.sourcesFolder: missing key or index',
        'At packages.0.mainPackageJson: missing key or index',
        'At commonPackageSettings.includeSourceMapFiles: expected boolean; but got string'
    ]
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
    expectedMessages: [
        'At commonPackageSettings: expected undefined; but got object',
        'At packages.0.sourcesFolder: missing key or index',
        'At packages.0.mainPackageJson: missing key or index',
        'At commonPackageSettings.additionalPackageJsonAttributes: expected object; but got string'
    ]
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
    expectedMessages: [
        'At commonPackageSettings: expected undefined; but got object',
        'At packages.0.sourcesFolder: missing key or index',
        'At packages.0.mainPackageJson: missing key or index',
        'At packages.0.versioning: expected object; but got string'
    ]
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
    expectedMessages: [
        'At commonPackageSettings: expected undefined; but got object',
        'At packages.0.sourcesFolder: missing key or index',
        'At packages.0.mainPackageJson: missing key or index',
        'At packages.0.bundleDependencies: expected array; but got string'
    ]
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
    expectedMessages: [
        'At commonPackageSettings: expected undefined; but got object',
        'At packages.0.sourcesFolder: missing key or index',
        'At packages.0.mainPackageJson: missing key or index',
        'At packages.0.bundlePeerDependencies: expected array; but got string'
    ]
});
