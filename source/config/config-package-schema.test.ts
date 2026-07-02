import { suite, test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import {
    configWith,
    mainPackageJson,
    packageConfig,
    packageWithoutCommonSettings,
    roots
} from '../test-libraries/config-schema-test-support.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';

const minimalRegistrylessPackage = packageConfig({ roots: { main: { js: 'index.js' } } });

suite('config package schema', function () {
    suite('package field validation failures', function () {
        test(
            'validation fails when name is missing in a package',
            checkValidationFailure({
                schema: packtoryConfigSchema,
                data: configWith({ packages: [ { sourcesFolder: 'foo', mainPackageJson, roots } ] }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when name is not a string',
            checkValidationFailure({
                schema: packtoryConfigSchema,
                data: configWith({ packages: [ packageConfig({ sourcesFolder: 'foo', name: 42 }) ] }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when roots is missing in a package',
            checkValidationFailure({
                schema: packtoryConfigSchema,
                data: configWith({ packages: [ { sourcesFolder: 'foo', mainPackageJson, name: 'foo' } ] }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when roots is not an object',
            checkValidationFailure({
                schema: packtoryConfigSchema,
                data: configWith({ packages: [ packageConfig({ sourcesFolder: 'foo', roots: 'foo' }) ] }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when a root entry is invalid',
            checkValidationFailure({
                schema: packtoryConfigSchema,
                data: configWith({
                    packages: [ packageConfig({ sourcesFolder: 'foo', roots: { main: { foo: 'bar' } } }) ]
                }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when additionalFiles is not an array',
            checkValidationFailure({
                schema: packtoryConfigSchema,
                data: configWith({
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageJson,
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
                schema: packtoryConfigSchema,
                data: configWith({
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageJson,
                        includeSourceMapFiles: 'foo'
                    },
                    packages: [ packageWithoutCommonSettings() ]
                }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when additionalPackageJsonAttributes is not an object',
            checkValidationFailure({
                schema: packtoryConfigSchema,
                data: configWith({
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageJson,
                        additionalPackageJsonAttributes: 'foo'
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
                schema: packtoryConfigSchema,
                data: configWith({
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageJson
                    },
                    packages: [ packageWithoutCommonSettings({ versioning: 'foo' }) ]
                }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when bundleDependencies is not an array',
            checkValidationFailure({
                schema: packtoryConfigSchema,
                data: configWith({
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageJson
                    },
                    packages: [ packageWithoutCommonSettings({ bundleDependencies: 'foo' }) ]
                }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when bundlePeerDependencies is not an array',
            checkValidationFailure({
                schema: packtoryConfigSchema,
                data: configWith({
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageJson
                    },
                    packages: [ packageWithoutCommonSettings({ bundlePeerDependencies: 'foo' }) ]
                }),
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation without registry succeeds for a minimal package config',
            checkValidationSuccess({
                schema: packtoryConfigWithoutRegistrySchema,
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
                schema: packtoryConfigWithoutRegistrySchema,
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
                schema: packtoryConfigWithoutRegistrySchema,
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
                schema: packtoryConfigWithoutRegistrySchema,
                data: {
                    packages: [ 'foo' ]
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
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
                    packages: [ packageWithoutCommonSettings({ roots: { main: { js: 'index.js' } } }) ]
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );
    });
});
