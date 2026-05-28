import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { RegistrySettings } from '../../config/registry-settings.ts';
import {
    buildAuthOptions,
    createBaseOptions,
    isNpmRegistry,
    resolveMetadataAuthOptions,
    resolvePublishAuth,
    resolveRegistryUrl,
    resolveStageListingAuthOptions
} from './registry-auth-config.ts';

const tokenAuth = { type: 'bearer-token', token: 'abc' } as const;
const basicAuth = {
    type: 'basic',
    username: 'user',
    password: 'pass',
    email: 'user@example.com'
} as const;

function settings(overrides: Partial<RegistrySettings> = {}): RegistrySettings {
    return { auth: tokenAuth, ...overrides };
}

const basicEncoded = Buffer.from('user:pass').toString('base64');
const stagedVersionLookupRequiresTokenAuthMessage =
    'npm staged publishing with automatic versioning requires token-based metadata auth ' +
    'when publish auth uses npm-oidc';

function expectedBasicAuthOptionsResult() {
    return {
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
    test('resolveRegistryUrl returns the configured registry URL', function () {
        assert.strictEqual(
            resolveRegistryUrl(settings({ registryUrl: 'https://internal.example.com/' })),
            'https://internal.example.com/'
        );
    });

    test('resolveRegistryUrl returns undefined when no registry URL is configured', function () {
        assert.strictEqual(resolveRegistryUrl(settings()), undefined);
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
        assert.deepStrictEqual(createBaseOptions(settings({ registryUrl: 'https://internal.example.com/' })), {
            alwaysAuth: true,
            registry: 'https://internal.example.com/'
        });
    });

    test('buildAuthOptions forces a bearer token when the strategy is bearer-token', function () {
        assert.deepStrictEqual(buildAuthOptions(tokenAuth, settings()), {
            allowsAutomaticRetry: false,
            registry: undefined,
            options: { alwaysAuth: true, registry: undefined, forceAuth: { token: 'abc' } }
        });
    });

    test('buildAuthOptions encodes user:password as base64 when the strategy is basic', function () {
        assert.deepStrictEqual(buildAuthOptions(basicAuth, settings({ auth: basicAuth })), {
            allowsAutomaticRetry: false,
            registry: undefined,
            options: {
                alwaysAuth: true,
                registry: undefined,
                forceAuth: { _auth: basicEncoded },
                email: 'user@example.com'
            }
        });
    });

    test('buildAuthOptions omits the email field when the basic auth strategy has no email', function () {
        assert.deepStrictEqual(buildAuthOptions({ type: 'basic', username: 'u', password: 'p' }, settings()), {
            allowsAutomaticRetry: false,
            registry: undefined,
            options: {
                alwaysAuth: true,
                registry: undefined,
                forceAuth: { _auth: Buffer.from('u:p').toString('base64') }
            }
        });
    });

    test('resolvePublishAuth returns the flat auth strategy directly', function () {
        assert.deepStrictEqual(resolvePublishAuth(settings()), tokenAuth);
    });

    test('resolvePublishAuth returns the publish branch of a split metadata/publish auth', function () {
        assert.deepStrictEqual(resolvePublishAuth({ auth: { publish: tokenAuth, metadata: 'auto' } }), tokenAuth);
    });

    test('resolveMetadataAuthOptions falls back to publish auth when no metadata mode is configured', function () {
        assert.deepStrictEqual(resolveMetadataAuthOptions(settings()), {
            allowsAutomaticRetry: false,
            registry: undefined,
            options: { alwaysAuth: true, registry: undefined, forceAuth: { token: 'abc' } }
        });
    });

    test('resolveMetadataAuthOptions returns anonymous options with retry enabled when metadata mode is auto', function () {
        assert.deepStrictEqual(resolveMetadataAuthOptions({ auth: { publish: tokenAuth, metadata: 'auto' } }), {
            allowsAutomaticRetry: true,
            registry: undefined,
            options: { alwaysAuth: true, registry: undefined }
        });
    });

    test('resolveMetadataAuthOptions returns anonymous options when publish auth is npm-oidc', function () {
        assert.deepStrictEqual(resolveMetadataAuthOptions({ auth: { type: 'npm-oidc' } }), {
            allowsAutomaticRetry: false,
            registry: undefined,
            options: { alwaysAuth: true, registry: undefined }
        });
    });

    test('resolveMetadataAuthOptions inherits publish auth when metadata mode is explicitly inherit-publish-auth', function () {
        assert.deepStrictEqual(
            resolveMetadataAuthOptions({ auth: { publish: tokenAuth, metadata: 'inherit-publish-auth' } }),
            {
                allowsAutomaticRetry: false,
                registry: undefined,
                options: { alwaysAuth: true, registry: undefined, forceAuth: { token: 'abc' } }
            }
        );
    });

    test('resolveMetadataAuthOptions uses a custom metadata auth strategy when one is provided', function () {
        assert.deepStrictEqual(
            resolveMetadataAuthOptions({ auth: { publish: tokenAuth, metadata: basicAuth } }),
            expectedBasicAuthOptionsResult()
        );
    });

    test('resolveMetadataAuthOptions returns anonymous options when auth is undefined', function () {
        assert.deepStrictEqual(resolveMetadataAuthOptions({}), {
            allowsAutomaticRetry: false,
            registry: undefined,
            options: { alwaysAuth: true, registry: undefined }
        });
    });

    test('resolvePublishAuth throws when auth is undefined', function () {
        try {
            resolvePublishAuth({});
            assert.fail('Expected resolvePublishAuth() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'registrySettings.auth must be configured to publish; this code path should be unreachable when auth is missing.'
            );
        }
    });

    test('resolveMetadataAuthOptions keeps npm-oidc metadata inheritance anonymous when explicitly requested', function () {
        assert.deepStrictEqual(
            resolveMetadataAuthOptions({ auth: { publish: { type: 'npm-oidc' }, metadata: 'inherit-publish-auth' } }),
            {
                allowsAutomaticRetry: false,
                registry: undefined,
                options: { alwaysAuth: true, registry: undefined }
            }
        );
    });

    test('resolveStageListingAuthOptions throws for shorthand npm-oidc auth', function () {
        assert.throws(() => {
            resolveStageListingAuthOptions({ auth: { type: 'npm-oidc' } });
        }, /requires token-based metadata auth/u);
    });

    test('resolveStageListingAuthOptions throws when publish auth is missing entirely', function () {
        assert.throws(() => {
            resolveStageListingAuthOptions({});
        }, /registrySettings\.auth must be configured to publish/u);
    });

    test('resolveStageListingAuthOptions uses shorthand publish auth when it is token-based', function () {
        assert.deepStrictEqual(resolveStageListingAuthOptions({ auth: tokenAuth }), {
            allowsAutomaticRetry: false,
            registry: undefined,
            options: { alwaysAuth: true, registry: undefined, forceAuth: { token: 'abc' } }
        });
    });

    test('resolveStageListingAuthOptions throws the documented message for expanded npm-oidc publish auth', function () {
        assert.throws(
            () => {
                resolveStageListingAuthOptions({
                    auth: {
                        publish: { type: 'npm-oidc', provider: 'env' },
                        metadata: 'anonymous'
                    }
                });
            },
            new RegExp(`^Error: ${stagedVersionLookupRequiresTokenAuthMessage}$`, 'u')
        );
    });

    test('resolveStageListingAuthOptions uses explicit metadata auth when it is configured', function () {
        assert.deepStrictEqual(
            resolveStageListingAuthOptions({ auth: { publish: tokenAuth, metadata: basicAuth } }),
            expectedBasicAuthOptionsResult()
        );
    });

    test('resolveStageListingAuthOptions still prefers explicit metadata auth when auth includes unrelated keys', function () {
        assert.deepStrictEqual(
            resolveStageListingAuthOptions({
                auth: {
                    '': { type: 'npm-oidc', provider: 'env' },
                    metadata: basicAuth,
                    publish: tokenAuth
                }
            } as unknown as RegistrySettings),
            expectedBasicAuthOptionsResult()
        );
    });
});
