import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { RegistrySettings } from '../../configuration/registry-settings.ts';
import {
    buildAuthenticationOptions,
    createBaseOptions,
    isNpmRegistry,
    resolveMetadataAuthenticationOptions,
    resolvePublishAuthentication,
    resolveRegistryAddress,
    resolveStageListingAuthenticationOptions,
    type AuthenticationResolution
} from './registry-authentication-configuration.ts';

const tokenAuthentication = { type: 'bearer-token', token: 'abc' } as const;
const basicAuthentication = {
    type: 'basic',
    username: 'user',
    password: 'pass',
    email: 'user@example.com'
} as const;

function settings(overrides: Partial<RegistrySettings> = {}): RegistrySettings {
    return { authentication: tokenAuthentication, ...overrides };
}

const basicEncoded = Buffer.from('user:pass').toString('base64');
const stagedVersionLookupRequiresTokenAuthenticationMessage =
    'npm staged publishing with automatic versioning requires token-based metadata auth ' +
    'when publish auth uses npm-oidc';

function expectedBasicAuthenticationOptionsResult(): AuthenticationResolution {
    return {
        authorization: `Basic ${basicEncoded}`,
        allowsAutomaticRetry: false,
        registry: undefined,
        options: {
            alwaysAuth: true,
            registry: undefined,
            forceAuth: { _auth: basicEncoded },
            email: 'user@example.com'
        }
    };
}

suite('registry-auth-config', function () {
    suite('registry urls and base options', function () {
        test('resolveRegistryAddress returns the configured registry URL', function () {
            assert.strictEqual(
                resolveRegistryAddress(settings({ registryAddress: 'https://internal.example.com/' })),
                'https://internal.example.com/'
            );
        });

        test('resolveRegistryAddress returns undefined when no registry URL is configured', function () {
            assert.strictEqual(resolveRegistryAddress(settings()), undefined);
        });

        test('isNpmRegistry returns true for the canonical npm registry URL', function () {
            assert.strictEqual(isNpmRegistry('https://registry.npmjs.org/'), true);
        });

        test('isNpmRegistry returns true when no URL is provided (defaults to npm)', function () {
            assert.strictEqual(isNpmRegistry(undefined), true);
        });

        test('isNpmRegistry returns false for a non-npm registry URL', function () {
            assert.strictEqual(isNpmRegistry('https://internal.example.com/'), false);
        });

        test('createBaseOptions always sets alwaysAuth and the configured registry', function () {
            assert.deepStrictEqual(createBaseOptions(settings({ registryAddress: 'https://internal.example.com/' })), {
                alwaysAuth: true,
                registry: 'https://internal.example.com/'
            });
        });
    });

    suite('auth option building', function () {
        test('buildAuthenticationOptions forces a bearer token when the strategy is bearer-token', function () {
            assert.deepStrictEqual(buildAuthenticationOptions(tokenAuthentication, settings()), {
                authorization: 'Bearer abc',
                allowsAutomaticRetry: false,
                registry: undefined,
                options: { alwaysAuth: true, registry: undefined, forceAuth: { token: 'abc' } }
            });
        });

        test('buildAuthenticationOptions encodes user:password as base64 when the strategy is basic', function () {
            assert.deepStrictEqual(
                buildAuthenticationOptions(basicAuthentication, settings({ authentication: basicAuthentication })),
                {
                    authorization: `Basic ${basicEncoded}`,
                    allowsAutomaticRetry: false,
                    registry: undefined,
                    options: {
                        alwaysAuth: true,
                        registry: undefined,
                        forceAuth: { _auth: basicEncoded },
                        email: 'user@example.com'
                    }
                }
            );
        });

        test('buildAuthenticationOptions omits the email field when the basic auth strategy has no email', function () {
            assert.deepStrictEqual(
                buildAuthenticationOptions({ type: 'basic', username: 'u', password: 'p' }, settings()),
                {
                    authorization: `Basic ${Buffer.from('u:p').toString('base64')}`,
                    allowsAutomaticRetry: false,
                    registry: undefined,
                    options: {
                        alwaysAuth: true,
                        registry: undefined,
                        forceAuth: { _auth: Buffer.from('u:p').toString('base64') }
                    }
                }
            );
        });
    });

    suite('publish and metadata auth', function () {
        test('resolvePublishAuthentication returns the flat auth strategy directly', function () {
            assert.deepStrictEqual(resolvePublishAuthentication(settings()), tokenAuthentication);
        });

        test('resolvePublishAuthentication returns the publish branch of a split metadata/publish auth', function () {
            assert.deepStrictEqual(
                resolvePublishAuthentication({
                    authentication: { publish: tokenAuthentication, metadata: 'automatic' }
                }),
                tokenAuthentication
            );
        });

        test('resolveMetadataAuthenticationOptions falls back to publish auth when no metadata mode is configured', function () {
            assert.deepStrictEqual(resolveMetadataAuthenticationOptions(settings()), {
                authorization: 'Bearer abc',
                allowsAutomaticRetry: false,
                registry: undefined,
                options: { alwaysAuth: true, registry: undefined, forceAuth: { token: 'abc' } }
            });
        });

        test('resolveMetadataAuthenticationOptions returns anonymous options with retry enabled when metadata mode is auto', function () {
            assert.deepStrictEqual(
                resolveMetadataAuthenticationOptions({
                    authentication: { publish: tokenAuthentication, metadata: 'automatic' }
                }),
                {
                    authorization: undefined,
                    allowsAutomaticRetry: true,
                    registry: undefined,
                    options: { alwaysAuth: true, registry: undefined }
                }
            );
        });

        test('resolveMetadataAuthenticationOptions returns anonymous options when publish auth is npm-oidc', function () {
            assert.deepStrictEqual(
                resolveMetadataAuthenticationOptions({ authentication: { type: 'npm-open-identity-connect' } }),
                {
                    authorization: undefined,
                    allowsAutomaticRetry: false,
                    registry: undefined,
                    options: { alwaysAuth: true, registry: undefined }
                }
            );
        });

        test('resolveMetadataAuthenticationOptions inherits publish auth when metadata mode is explicitly inherit-publish-auth', function () {
            assert.deepStrictEqual(
                resolveMetadataAuthenticationOptions({
                    authentication: { publish: tokenAuthentication, metadata: 'inherit-publish-authentication' }
                }),
                {
                    authorization: 'Bearer abc',
                    allowsAutomaticRetry: false,
                    registry: undefined,
                    options: { alwaysAuth: true, registry: undefined, forceAuth: { token: 'abc' } }
                }
            );
        });

        test('resolveMetadataAuthenticationOptions uses a custom metadata auth strategy when one is provided', function () {
            assert.deepStrictEqual(
                resolveMetadataAuthenticationOptions({
                    authentication: { publish: tokenAuthentication, metadata: basicAuthentication }
                }),
                expectedBasicAuthenticationOptionsResult()
            );
        });

        test('resolveMetadataAuthenticationOptions returns anonymous options when auth is undefined', function () {
            assert.deepStrictEqual(resolveMetadataAuthenticationOptions({}), {
                authorization: undefined,
                allowsAutomaticRetry: false,
                registry: undefined,
                options: { alwaysAuth: true, registry: undefined }
            });
        });

        test('resolvePublishAuthentication throws when auth is undefined', function () {
            try {
                resolvePublishAuthentication({});
                assert.fail('Expected resolvePublishAuthentication() to throw but it did not');
            } catch (error: unknown) {
                assert.strictEqual(
                    (error as Error).message,
                    'registrySettings.authentication must be configured to publish.'
                );
            }
        });

        test('resolveMetadataAuthenticationOptions keeps npm-oidc metadata inheritance anonymous when explicitly requested', function () {
            assert.deepStrictEqual(
                resolveMetadataAuthenticationOptions({
                    authentication: {
                        publish: { type: 'npm-open-identity-connect' },
                        metadata: 'inherit-publish-authentication'
                    }
                }),
                {
                    authorization: undefined,
                    allowsAutomaticRetry: false,
                    registry: undefined,
                    options: { alwaysAuth: true, registry: undefined }
                }
            );
        });
    });

    suite('stage listing auth', function () {
        test('resolveStageListingAuthenticationOptions throws for shorthand npm-oidc auth', function () {
            assert.throws(function () {
                resolveStageListingAuthenticationOptions({ authentication: { type: 'npm-open-identity-connect' } });
            }, /requires token-based metadata auth/u);
        });

        test('resolveStageListingAuthenticationOptions throws when publish auth is missing entirely', function () {
            assert.throws(function () {
                resolveStageListingAuthenticationOptions({});
            }, /registrySettings\.authentication must be configured to publish/u);
        });

        test('resolveStageListingAuthenticationOptions uses shorthand publish auth when it is token-based', function () {
            assert.deepStrictEqual(resolveStageListingAuthenticationOptions({ authentication: tokenAuthentication }), {
                authorization: 'Bearer abc',
                allowsAutomaticRetry: false,
                registry: undefined,
                options: { alwaysAuth: true, registry: undefined, forceAuth: { token: 'abc' } }
            });
        });

        test('resolveStageListingAuthenticationOptions throws the documented message for expanded npm-oidc publish auth', function () {
            assert.throws(
                function () {
                    resolveStageListingAuthenticationOptions({
                        authentication: {
                            publish: { type: 'npm-open-identity-connect', provider: 'environment' },
                            metadata: 'anonymous'
                        }
                    });
                },
                new RegExp(`^Error: ${stagedVersionLookupRequiresTokenAuthenticationMessage}$`, 'u')
            );
        });

        test('resolveStageListingAuthenticationOptions uses explicit metadata auth when it is configured', function () {
            assert.deepStrictEqual(
                resolveStageListingAuthenticationOptions({
                    authentication: { publish: tokenAuthentication, metadata: basicAuthentication }
                }),
                expectedBasicAuthenticationOptionsResult()
            );
        });

        test('resolveStageListingAuthenticationOptions still prefers explicit metadata auth when auth includes unrelated keys', function () {
            assert.deepStrictEqual(
                resolveStageListingAuthenticationOptions({
                    authentication: {
                        '': { type: 'npm-open-identity-connect', provider: 'environment' },
                        metadata: basicAuthentication,
                        publish: tokenAuthentication
                    }
                } as unknown as RegistrySettings),
                expectedBasicAuthenticationOptionsResult()
            );
        });
    });
});
