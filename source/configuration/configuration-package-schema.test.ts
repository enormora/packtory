import { suite, test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import {
    configurationWith,
    mainPackageManifest,
    packageConfiguration,
    packageWithoutCommonSettings,
    roots
} from '../test-libraries/configuration-schema-test-support.ts';
import { packtoryConfigurationSchema } from './packtory-configuration-schema.ts';
import { packtoryConfigurationWithoutRegistrySchema } from './packtory-configuration-without-registry-schema.ts';

const minimalRegistrylessPackage = packageConfiguration({ roots: { main: { javaScript: 'index.js' } } });

suite('config package schema', function () {
    test(
        'accepts JSON-only packages with an empty root map',
        checkValidationSuccess({
            schema: packtoryConfigurationWithoutRegistrySchema,
            data: {
                packages: [ packageConfiguration({
                    roots: {},
                    additionalFiles: [
                        { inputFilePath: 'tsconfig.json', targetFilePath: 'tsconfig.json' }
                    ]
                }) ]
            },
            expectedData: {
                packages: [ packageConfiguration({
                    roots: {},
                    additionalFiles: [
                        { inputFilePath: 'tsconfig.json', targetFilePath: 'tsconfig.json' }
                    ]
                }) ]
            }
        })
    );

    suite('package field validation failures', function () {
        const validationCases = [
            {
                name: 'validation fails when name is missing in a package',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({ packages: [ { sourcesFolder: 'foo', mainPackageManifest, roots } ] }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation fails when name is not a string',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({ packages: [ packageConfiguration({ sourcesFolder: 'foo', name: 42 }) ] }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation fails when roots is missing in a package',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({
                        packages: [ { sourcesFolder: 'foo', mainPackageManifest, name: 'foo' } ]
                    }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation fails when roots is not an object',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({
                        packages: [ packageConfiguration({ sourcesFolder: 'foo', roots: 'foo' }) ]
                    }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation fails when a root entry is invalid',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({
                        packages: [ packageConfiguration({ sourcesFolder: 'foo', roots: { main: { foo: 'bar' } } }) ]
                    }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation fails when additionalFiles is not an array',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({
                        commonPackageSettings: {
                            sourcesFolder: 'source',
                            mainPackageManifest,
                            additionalFiles: 'foo'
                        },
                        packages: [ packageWithoutCommonSettings() ]
                    }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation fails when includeSourceMapFiles is not a boolean',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({
                        commonPackageSettings: {
                            sourcesFolder: 'source',
                            mainPackageManifest,
                            includeSourceMapFiles: 'foo'
                        },
                        packages: [ packageWithoutCommonSettings() ]
                    }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation fails when additionalPackageManifestAttributes is not an object',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({
                        commonPackageSettings: {
                            sourcesFolder: 'source',
                            mainPackageManifest,
                            additionalPackageManifestAttributes: 'foo'
                        },
                        packages: [ packageWithoutCommonSettings() ]
                    }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            }
        ];
        for (const { name, validate } of validationCases) {
            test(name, validate);
        }
    });

    suite('registryless package schema', function () {
        const validationCases = [
            {
                name: 'validation fails when versioning is not an object',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({
                        commonPackageSettings: {
                            sourcesFolder: 'source',
                            mainPackageManifest
                        },
                        packages: [ packageWithoutCommonSettings({ versioning: 'foo' }) ]
                    }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation fails when bundleDependencies is not an array',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({
                        commonPackageSettings: {
                            sourcesFolder: 'source',
                            mainPackageManifest
                        },
                        packages: [ packageWithoutCommonSettings({ bundleDependencies: 'foo' }) ]
                    }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation fails when bundlePeerDependencies is not an array',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationSchema,
                    data: configurationWith({
                        commonPackageSettings: {
                            sourcesFolder: 'source',
                            mainPackageManifest
                        },
                        packages: [ packageWithoutCommonSettings({ bundlePeerDependencies: 'foo' }) ]
                    }),
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation without registry succeeds for a minimal package config',
                validate: checkValidationSuccess({
                    schema: packtoryConfigurationWithoutRegistrySchema,
                    data: {
                        packages: [ minimalRegistrylessPackage ]
                    },
                    expectedData: {
                        packages: [ minimalRegistrylessPackage ]
                    }
                })
            },
            {
                name: 'validation without registry fails when checks is not an object',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationWithoutRegistrySchema,
                    data: {
                        checks: 'foo',
                        packages: [ minimalRegistrylessPackage ]
                    },
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation without registry fails when commonPackageSettings is not an object',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationWithoutRegistrySchema,
                    data: {
                        commonPackageSettings: 'foo',
                        packages: [ minimalRegistrylessPackage ]
                    },
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation without registry fails when a package entry is not an object',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationWithoutRegistrySchema,
                    data: {
                        packages: [ 'foo' ]
                    },
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            },
            {
                name: 'validation prefixes common package.json issues with commonPackageSettings',
                validate: checkValidationFailure({
                    schema: packtoryConfigurationWithoutRegistrySchema,
                    data: {
                        commonPackageSettings: {
                            sourcesFolder: 'source',
                            mainPackageManifest: { dependencies: true }
                        },
                        packages: [ packageWithoutCommonSettings({ roots: { main: { javaScript: 'index.js' } } }) ]
                    },
                    expectedMessages: [ 'invalid value doesn’t match expected union' ]
                })
            }
        ];
        for (const { name, validate } of validationCases) {
            test(name, validate);
        }
    });
});
