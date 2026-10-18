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
    suite('package field validation failures', function () {
        test(
            'validation fails when name is missing in a package',
            checkValidationFailure({
                schema: packtoryConfigurationSchema,
                data: configurationWith({ packages: [ { sourcesFolder: 'foo', mainPackageManifest, roots } ] }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when name is not a string',
            checkValidationFailure({
                schema: packtoryConfigurationSchema,
                data: configurationWith({ packages: [ packageConfiguration({ sourcesFolder: 'foo', name: 42 }) ] }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when roots is missing in a package',
            checkValidationFailure({
                schema: packtoryConfigurationSchema,
                data: configurationWith({ packages: [ { sourcesFolder: 'foo', mainPackageManifest, name: 'foo' } ] }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when roots is not an object',
            checkValidationFailure({
                schema: packtoryConfigurationSchema,
                data: configurationWith({ packages: [ packageConfiguration({ sourcesFolder: 'foo', roots: 'foo' }) ] }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when a root entry is invalid',
            checkValidationFailure({
                schema: packtoryConfigurationSchema,
                data: configurationWith({
                    packages: [ packageConfiguration({ sourcesFolder: 'foo', roots: { main: { foo: 'bar' } } }) ]
                }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when additionalFiles is not an array',
            checkValidationFailure({
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
        );

        test(
            'validation fails when includeSourceMapFiles is not a boolean',
            checkValidationFailure({
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
        );

        test(
            'validation fails when additionalPackageManifestAttributes is not an object',
            checkValidationFailure({
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
        );
    });

    suite('registryless package schema', function () {
        test(
            'validation fails when versioning is not an object',
            checkValidationFailure({
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
        );

        test(
            'validation fails when bundleDependencies is not an array',
            checkValidationFailure({
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
        );

        test(
            'validation fails when bundlePeerDependencies is not an array',
            checkValidationFailure({
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
        );

        test(
            'validation without registry succeeds for a minimal package config',
            checkValidationSuccess({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    packages: [ minimalRegistrylessPackage ]
                },
                expectedData: {
                    packages: [ minimalRegistrylessPackage ]
                }
            })
        );

        test(
            'validation without registry fails when checks is not an object',
            checkValidationFailure({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    checks: 'foo',
                    packages: [ minimalRegistrylessPackage ]
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation without registry fails when commonPackageSettings is not an object',
            checkValidationFailure({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    commonPackageSettings: 'foo',
                    packages: [ minimalRegistrylessPackage ]
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation without registry fails when a package entry is not an object',
            checkValidationFailure({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    packages: [ 'foo' ]
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation prefixes common package.json issues with commonPackageSettings',
            checkValidationFailure({
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
        );
    });
});
