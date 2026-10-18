import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { RegistrySettings } from './registry-settings.ts';
import { redactRegistrySettings } from './registry-settings.report.ts';

suite('registry-settings.report', function () {
    suite('registry secret redaction', function () {
        test('redacts a bearer-token auth', function () {
            const settings = {
                registryAddress: 'https://registry.example.com',
                authentication: { type: 'bearer-token', token: 'real-secret' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                registryAddress: 'https://registry.example.com',
                authentication: { type: 'bearer-token', token: '[redacted]' }
            });
        });

        test('redacts a basic auth password but preserves username and email', function () {
            const settings = {
                authentication: {
                    type: 'basic',
                    username: 'alice',
                    password: 'real-secret',
                    email: 'alice@example.com'
                }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                authentication: { type: 'basic', username: 'alice', password: '[redacted]', email: 'alice@example.com' }
            });
        });

        test('preserves npm-oidc provider and identityTokenEnvironmentVariable - no secrets to redact', function () {
            const settings = {
                authentication: {
                    type: 'npm-open-identity-connect',
                    provider: 'github-actions',
                    identityTokenEnvironmentVariable: 'NPM_ID_TOKEN'
                }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                authentication: {
                    type: 'npm-open-identity-connect',
                    provider: 'github-actions',
                    identityTokenEnvironmentVariable: 'NPM_ID_TOKEN'
                }
            });
        });

        test('redacts both publish and metadata when auth is expanded', function () {
            const settings = {
                authentication: {
                    publish: { type: 'bearer-token', token: 'publish-secret' },
                    metadata: { type: 'basic', username: 'm', password: 'metadata-secret' }
                }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                authentication: {
                    publish: { type: 'bearer-token', token: '[redacted]' },
                    metadata: { strategy: { type: 'basic', username: 'm', password: '[redacted]' } }
                }
            });
        });

        test('omits auth when undefined', function () {
            const settings = {
                registryAddress: 'https://registry.example.com'
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, { registryAddress: 'https://registry.example.com' });
            assert.strictEqual(Object.hasOwn(redacted, 'authentication'), false);
        });

        test('returns an empty object when both registryAddress and auth are undefined', function () {
            const redacted = redactRegistrySettings({});

            assert.deepStrictEqual(redacted, {});
        });

        test('omits registryAddress when undefined', function () {
            const settings = {
                authentication: { type: 'bearer-token', token: 'real-secret' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.strictEqual(Object.hasOwn(redacted, 'registryAddress'), false);
        });

        test('omits email on basic auth when not provided', function () {
            const settings = {
                authentication: { type: 'basic', username: 'alice', password: 'real-secret' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                authentication: { type: 'basic', username: 'alice', password: '[redacted]' }
            });
        });
    });

    suite('registry oidc report fields', function () {
        test('omits provider on npm-oidc auth when not provided', function () {
            const settings = {
                authentication: { type: 'npm-open-identity-connect', identityTokenEnvironmentVariable: 'NPM_ID_TOKEN' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                authentication: { type: 'npm-open-identity-connect', identityTokenEnvironmentVariable: 'NPM_ID_TOKEN' }
            });
        });

        test('omits identityTokenEnvironmentVariable on npm-oidc auth when not provided', function () {
            const settings = {
                authentication: { type: 'npm-open-identity-connect', provider: 'github-actions' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                authentication: { type: 'npm-open-identity-connect', provider: 'github-actions' }
            });
        });

        test('omits both provider and identityTokenEnvironmentVariable on npm-oidc auth when neither is provided', function () {
            const settings = {
                authentication: { type: 'npm-open-identity-connect' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, { authentication: { type: 'npm-open-identity-connect' } });
        });

        test('omits metadata on expanded auth when not provided', function () {
            const settings = {
                authentication: {
                    publish: { type: 'bearer-token', token: 'publish-secret' }
                }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                authentication: { publish: { type: 'bearer-token', token: '[redacted]' } }
            });
        });

        test('represents string metadata modes verbatim under a "mode" key', function () {
            const automaticMode = redactRegistrySettings({
                authentication: {
                    publish: { type: 'bearer-token', token: 'pub' },
                    metadata: 'automatic'
                }
            } as unknown as RegistrySettings);

            const anonymousMode = redactRegistrySettings({
                authentication: {
                    publish: { type: 'bearer-token', token: 'pub' },
                    metadata: 'anonymous'
                }
            } as unknown as RegistrySettings);

            const inheritMode = redactRegistrySettings({
                authentication: {
                    publish: { type: 'bearer-token', token: 'pub' },
                    metadata: 'inherit-publish-authentication'
                }
            } as unknown as RegistrySettings);

            assert.deepStrictEqual(automaticMode.authentication, {
                publish: { type: 'bearer-token', token: '[redacted]' },
                metadata: { mode: 'automatic' }
            });
            assert.deepStrictEqual(anonymousMode.authentication, {
                publish: { type: 'bearer-token', token: '[redacted]' },
                metadata: { mode: 'anonymous' }
            });
            assert.deepStrictEqual(inheritMode.authentication, {
                publish: { type: 'bearer-token', token: '[redacted]' },
                metadata: { mode: 'inherit-publish-authentication' }
            });
        });

        test('represents object metadata strategies under a "strategy" key with redacted secrets', function () {
            const redacted = redactRegistrySettings({
                authentication: {
                    publish: { type: 'bearer-token', token: 'pub' },
                    metadata: { type: 'bearer-token', token: 'meta-secret' }
                }
            } as unknown as RegistrySettings);

            assert.deepStrictEqual(redacted.authentication, {
                publish: { type: 'bearer-token', token: '[redacted]' },
                metadata: { strategy: { type: 'bearer-token', token: '[redacted]' } }
            });
        });
    });
});
