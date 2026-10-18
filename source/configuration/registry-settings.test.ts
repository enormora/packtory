import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { registrySettingsSchema } from './registry-settings.ts';

const bearerTokenAuthentication = { type: 'bearer-token', token: 'foo' } as const;

suite('registry-settings', function () {
    suite('registry settings schema', function () {
        test('schema accepts registry settings with shorthand auth', function () {
            assert.strictEqual(
                safeParse(registrySettingsSchema, { authentication: bearerTokenAuthentication }).success,
                true
            );
        });

        test('schema accepts registry settings without auth', function () {
            assert.strictEqual(safeParse(registrySettingsSchema, { registryAddress: 'bar' }).success, true);
        });

        test('schema accepts an empty registry settings object', function () {
            assert.strictEqual(safeParse(registrySettingsSchema, {}).success, true);
        });

        test(
            'validation succeeds when shorthand auth is given',
            checkValidationSuccess({
                schema: registrySettingsSchema,
                data: {
                    authentication: bearerTokenAuthentication
                },
                expectedData: {
                    authentication: bearerTokenAuthentication
                }
            })
        );

        test(
            'validation succeeds when explicit publish and metadata auth are given',
            checkValidationSuccess({
                schema: registrySettingsSchema,
                data: {
                    registryAddress: 'https://registry.example',
                    authentication: {
                        publish: { type: 'basic', username: 'foo', password: 'bar', email: 'foo@example.test' },
                        metadata: 'automatic'
                    }
                },
                expectedData: {
                    registryAddress: 'https://registry.example',
                    authentication: {
                        publish: { type: 'basic', username: 'foo', password: 'bar', email: 'foo@example.test' },
                        metadata: 'automatic'
                    }
                }
            })
        );

        test(
            'validation succeeds when explicit metadata auth inherits separate basic credentials',
            checkValidationSuccess({
                schema: registrySettingsSchema,
                data: {
                    authentication: {
                        publish: { type: 'bearer-token', token: 'writer-token' },
                        metadata: { type: 'basic', username: 'reader', password: 'secret' }
                    }
                },
                expectedData: {
                    authentication: {
                        publish: { type: 'bearer-token', token: 'writer-token' },
                        metadata: { type: 'basic', username: 'reader', password: 'secret' }
                    }
                }
            })
        );

        test(
            'validation accepts npm oidc publish auth',
            checkValidationSuccess({
                schema: registrySettingsSchema,
                data: {
                    authentication: {
                        publish: {
                            type: 'npm-open-identity-connect',
                            provider: 'environment',
                            identityTokenEnvironmentVariable: 'CUSTOM_IDENTIFIER_TOKEN'
                        },
                        metadata: 'anonymous'
                    }
                },
                expectedData: {
                    authentication: {
                        publish: {
                            type: 'npm-open-identity-connect',
                            provider: 'environment',
                            identityTokenEnvironmentVariable: 'CUSTOM_IDENTIFIER_TOKEN'
                        },
                        metadata: 'anonymous'
                    }
                }
            })
        );

        test(
            'validation accepts npm oidc publish auth for the auto provider',
            checkValidationSuccess({
                schema: registrySettingsSchema,
                data: {
                    authentication: {
                        publish: { type: 'npm-open-identity-connect', provider: 'automatic' },
                        metadata: 'anonymous'
                    }
                },
                expectedData: {
                    authentication: {
                        publish: { type: 'npm-open-identity-connect', provider: 'automatic' },
                        metadata: 'anonymous'
                    }
                }
            })
        );
    });

    suite('registry auth validation', function () {
        test(
            'validation accepts npm oidc publish auth for the GitHub Actions provider',
            checkValidationSuccess({
                schema: registrySettingsSchema,
                data: {
                    authentication: {
                        publish: { type: 'npm-open-identity-connect', provider: 'github-actions' },
                        metadata: 'anonymous'
                    }
                },
                expectedData: {
                    authentication: {
                        publish: { type: 'npm-open-identity-connect', provider: 'github-actions' },
                        metadata: 'anonymous'
                    }
                }
            })
        );

        test(
            'validation fails when a non-object value is given',
            checkValidationFailure({
                schema: registrySettingsSchema,
                data: 'foo',
                expectedMessages: [ 'expected object, but got string' ]
            })
        );

        test(
            'validation succeeds when an empty object is given',
            checkValidationSuccess({
                schema: registrySettingsSchema,
                data: {},
                expectedData: {}
            })
        );

        test(
            'validation fails when shorthand auth uses an empty token',
            checkValidationFailure({
                schema: registrySettingsSchema,
                data: { authentication: { type: 'bearer-token', token: '' } },
                expectedMessages: [ 'at authentication.token: string must contain at least 1 character' ]
            })
        );

        test(
            'validation fails when metadata auth uses npm oidc',
            checkValidationFailure({
                schema: registrySettingsSchema,
                data: {
                    authentication: {
                        publish: bearerTokenAuthentication,
                        metadata: { type: 'npm-open-identity-connect' }
                    }
                },
                expectedMessages: [
                    'at authentication: invalid value: expected one of "automatic", "anonymous" or "inherit-publish-authentication", but got object'
                ]
            })
        );

        test(
            'validation fails when registryAddress is null',
            checkValidationFailure({
                schema: registrySettingsSchema,
                data: { authentication: bearerTokenAuthentication, registryAddress: null },
                expectedMessages: [ 'at registryAddress: expected string, but got null' ]
            })
        );

        test(
            'validation fails when an additional property is given',
            checkValidationFailure({
                schema: registrySettingsSchema,
                data: { authentication: bearerTokenAuthentication, extra: 'bar' },
                expectedMessages: [ 'unexpected additional property: "extra"' ]
            })
        );
    });
});
