import { suite, test } from 'mocha';
import { checkValidationFailure } from '../test-libraries/verify-schema-validation.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';

suite('config error prefixes', function () {
    suite('nested validation error prefixes', function () {
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
                    packages: [ { name: 'foo', roots: { main: { js: 'index.js' } } } ]
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
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
                            additionalFiles: [ { sourceFilePath: 'asset.txt' } ]
                        }
                    ]
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
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
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
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
                expectedMessages: [ 'at registrySettings.auth: invalid value: expected string, but got object' ]
            })
        );
    });
});
