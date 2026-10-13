import { suite, test } from 'mocha';
import { checkValidationFailure } from '../test-libraries/verify-schema-validation.ts';
import { packtoryConfigurationSchema } from './packtory-configuration-schema.ts';
import { packtoryConfigurationWithoutRegistrySchema } from './packtory-configuration-without-registry-schema.ts';

suite('config error prefixes', function () {
    suite('nested validation error prefixes', function () {
        test(
            'validation prefixes common additional package.json attribute issues with commonPackageSettings',
            checkValidationFailure({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        additionalPackageManifestAttributes: { dependencies: '1.0.0' }
                    },
                    packages: [ { name: 'foo', roots: { main: { javaScript: 'index.js' } } } ]
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation prefixes package additionalFiles issues with the array entry path',
            checkValidationFailure({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    packages: [
                        {
                            sourcesFolder: 'source',
                            mainPackageManifest: { type: 'module' },
                            name: 'foo',
                            roots: { main: { javaScript: 'index.js' } },
                            additionalFiles: [ { inputFilePath: 'asset.txt' } ]
                        }
                    ]
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation prefixes package additional package.json attribute issues',
            checkValidationFailure({
                schema: packtoryConfigurationWithoutRegistrySchema,
                data: {
                    packages: [
                        {
                            sourcesFolder: 'source',
                            mainPackageManifest: { type: 'module' },
                            name: 'foo',
                            roots: { main: { javaScript: 'index.js' } },
                            additionalPackageManifestAttributes: { version: '1.0.0' }
                        }
                    ]
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation prefixes registry settings issues with registrySettings',
            checkValidationFailure({
                schema: packtoryConfigurationSchema,
                data: {
                    registrySettings: {
                        authentication: { type: 'bearer-token', token: 42 }
                    },
                    packages: [
                        {
                            sourcesFolder: 'source',
                            mainPackageManifest: { type: 'module' },
                            name: 'foo',
                            roots: { main: { javaScript: 'index.js' } }
                        }
                    ]
                },
                expectedMessages: [
                    'at registrySettings.authentication: invalid value: expected string, but got object'
                ]
            })
        );
    });
});
