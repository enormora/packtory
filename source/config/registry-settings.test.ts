import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { suite, test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { registrySettingsSchema } from './registry-settings.ts';

const bearerTokenAuth = { type: 'bearer-token', token: 'foo' } as const;

suite('registry-settings', function () {
    test('schema accepts registry settings with shorthand auth', function () {
        assert.strictEqual(safeParse(registrySettingsSchema, { auth: bearerTokenAuth }).success, true);
    });

    test('schema rejects registry settings without auth', function () {
        assert.strictEqual(safeParse(registrySettingsSchema, { registryUrl: 'bar' }).success, false);
    });

    test(
        'validation succeeds when shorthand auth is given',
        checkValidationSuccess({
            schema: registrySettingsSchema,
            data: {
                auth: bearerTokenAuth
            },
            expectedData: {
                auth: bearerTokenAuth
            }
        })
    );

    test(
        'validation succeeds when explicit publish and metadata auth are given',
        checkValidationSuccess({
            schema: registrySettingsSchema,
            data: {
                registryUrl: 'https://registry.example',
                auth: {
                    publish: { type: 'basic', username: 'foo', password: 'bar', email: 'foo@example.test' },
                    metadata: 'auto'
                }
            },
            expectedData: {
                registryUrl: 'https://registry.example',
                auth: {
                    publish: { type: 'basic', username: 'foo', password: 'bar', email: 'foo@example.test' },
                    metadata: 'auto'
                }
            }
        })
    );

    test(
        'validation succeeds when explicit metadata auth inherits separate basic credentials',
        checkValidationSuccess({
            schema: registrySettingsSchema,
            data: {
                auth: {
                    publish: { type: 'bearer-token', token: 'writer-token' },
                    metadata: { type: 'basic', username: 'reader', password: 'secret' }
                }
            },
            expectedData: {
                auth: {
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
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env', idTokenEnvVar: 'CUSTOM_ID_TOKEN' },
                    metadata: 'anonymous'
                }
            },
            expectedData: {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env', idTokenEnvVar: 'CUSTOM_ID_TOKEN' },
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
                auth: {
                    publish: { type: 'npm-oidc', provider: 'auto' },
                    metadata: 'anonymous'
                }
            },
            expectedData: {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'auto' },
                    metadata: 'anonymous'
                }
            }
        })
    );

    test(
        'validation accepts npm oidc publish auth for the GitHub Actions provider',
        checkValidationSuccess({
            schema: registrySettingsSchema,
            data: {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'github-actions' },
                    metadata: 'anonymous'
                }
            },
            expectedData: {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'github-actions' },
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
            expectedMessages: ['expected object, but got string']
        })
    );

    test(
        'validation fails when an empty object is given',
        checkValidationFailure({
            schema: registrySettingsSchema,
            data: {},
            expectedMessages: ['at auth: missing property']
        })
    );

    test(
        'validation fails when shorthand auth uses an empty token',
        checkValidationFailure({
            schema: registrySettingsSchema,
            data: { auth: { type: 'bearer-token', token: '' } },
            expectedMessages: ['at auth.token: string must contain at least 1 character']
        })
    );

    test(
        'validation fails when metadata auth uses npm oidc',
        checkValidationFailure({
            schema: registrySettingsSchema,
            data: {
                auth: {
                    publish: bearerTokenAuth,
                    metadata: { type: 'npm-oidc' }
                }
            },
            expectedMessages: [
                'at auth: invalid value: expected one of "auto", "anonymous" or "inherit-publish-auth", but got object'
            ]
        })
    );

    test(
        'validation fails when registryUrl is null',
        checkValidationFailure({
            schema: registrySettingsSchema,
            data: { auth: bearerTokenAuth, registryUrl: null },
            expectedMessages: ['at registryUrl: expected string, but got null']
        })
    );

    test(
        'validation fails when an additional property is given',
        checkValidationFailure({
            schema: registrySettingsSchema,
            data: { auth: bearerTokenAuth, extra: 'bar' },
            expectedMessages: ['unexpected additional property: "extra"']
        })
    );
});
