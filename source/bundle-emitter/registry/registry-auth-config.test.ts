import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { RegistrySettings } from '../../config/registry-settings.ts';
import {
    buildAuthOptions,
    createBaseOptions,
    isNpmRegistry,
    resolveMetadataAuthOptions,
    resolvePublishAuth,
    resolveRegistryUrl
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

    test('resolveMetadataAuthOptions uses a custom metadata auth strategy when one is provided', function () {
        assert.deepStrictEqual(resolveMetadataAuthOptions({ auth: { publish: tokenAuth, metadata: basicAuth } }), {
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
});
