import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { RegistrySettings } from './registry-settings.ts';
import { redactRegistrySettings } from './registry-settings.report.ts';

suite('registry-settings.report', function () {
    suite('registry secret redaction', function () {
        test('redacts a bearer-token auth', function () {
            const settings = {
                registryUrl: 'https://registry.example.com',
                auth: { type: 'bearer-token', token: 'real-secret' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                registryUrl: 'https://registry.example.com',
                auth: { type: 'bearer-token', token: '[redacted]' }
            });
        });

        test('redacts a basic auth password but preserves username and email', function () {
            const settings = {
                auth: { type: 'basic', username: 'alice', password: 'real-secret', email: 'alice@example.com' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                auth: { type: 'basic', username: 'alice', password: '[redacted]', email: 'alice@example.com' }
            });
        });

        test('preserves npm-oidc provider and idTokenEnvVar - no secrets to redact', function () {
            const settings = {
                auth: { type: 'npm-oidc', provider: 'github-actions', idTokenEnvVar: 'NPM_ID_TOKEN' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                auth: { type: 'npm-oidc', provider: 'github-actions', idTokenEnvVar: 'NPM_ID_TOKEN' }
            });
        });

        test('redacts both publish and metadata when auth is expanded', function () {
            const settings = {
                auth: {
                    publish: { type: 'bearer-token', token: 'publish-secret' },
                    metadata: { type: 'basic', username: 'm', password: 'metadata-secret' }
                }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                auth: {
                    publish: { type: 'bearer-token', token: '[redacted]' },
                    metadata: { strategy: { type: 'basic', username: 'm', password: '[redacted]' } }
                }
            });
        });

        test('omits auth when undefined', function () {
            const settings = {
                registryUrl: 'https://registry.example.com'
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, { registryUrl: 'https://registry.example.com' });
            assert.strictEqual(Object.hasOwn(redacted, 'auth'), false);
        });

        test('returns an empty object when both registryUrl and auth are undefined', function () {
            const redacted = redactRegistrySettings({});

            assert.deepStrictEqual(redacted, {});
        });

        test('omits registryUrl when undefined', function () {
            const settings = {
                auth: { type: 'bearer-token', token: 'real-secret' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.strictEqual(Object.hasOwn(redacted, 'registryUrl'), false);
        });

        test('omits email on basic auth when not provided', function () {
            const settings = {
                auth: { type: 'basic', username: 'alice', password: 'real-secret' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                auth: { type: 'basic', username: 'alice', password: '[redacted]' }
            });
        });
    });

    suite('registry oidc report fields', function () {
        test('omits provider on npm-oidc auth when not provided', function () {
            const settings = {
                auth: { type: 'npm-oidc', idTokenEnvVar: 'NPM_ID_TOKEN' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                auth: { type: 'npm-oidc', idTokenEnvVar: 'NPM_ID_TOKEN' }
            });
        });

        test('omits idTokenEnvVar on npm-oidc auth when not provided', function () {
            const settings = {
                auth: { type: 'npm-oidc', provider: 'github-actions' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                auth: { type: 'npm-oidc', provider: 'github-actions' }
            });
        });

        test('omits both provider and idTokenEnvVar on npm-oidc auth when neither is provided', function () {
            const settings = {
                auth: { type: 'npm-oidc' }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, { auth: { type: 'npm-oidc' } });
        });

        test('omits metadata on expanded auth when not provided', function () {
            const settings = {
                auth: {
                    publish: { type: 'bearer-token', token: 'publish-secret' }
                }
            } as unknown as RegistrySettings;

            const redacted = redactRegistrySettings(settings);

            assert.deepStrictEqual(redacted, {
                auth: { publish: { type: 'bearer-token', token: '[redacted]' } }
            });
        });

        test('represents string metadata modes verbatim under a "mode" key', function () {
            const autoMode = redactRegistrySettings({
                auth: {
                    publish: { type: 'bearer-token', token: 'pub' },
                    metadata: 'auto'
                }
            } as unknown as RegistrySettings);

            const anonymousMode = redactRegistrySettings({
                auth: {
                    publish: { type: 'bearer-token', token: 'pub' },
                    metadata: 'anonymous'
                }
            } as unknown as RegistrySettings);

            const inheritMode = redactRegistrySettings({
                auth: {
                    publish: { type: 'bearer-token', token: 'pub' },
                    metadata: 'inherit-publish-auth'
                }
            } as unknown as RegistrySettings);

            assert.deepStrictEqual(autoMode.auth, {
                publish: { type: 'bearer-token', token: '[redacted]' },
                metadata: { mode: 'auto' }
            });
            assert.deepStrictEqual(anonymousMode.auth, {
                publish: { type: 'bearer-token', token: '[redacted]' },
                metadata: { mode: 'anonymous' }
            });
            assert.deepStrictEqual(inheritMode.auth, {
                publish: { type: 'bearer-token', token: '[redacted]' },
                metadata: { mode: 'inherit-publish-auth' }
            });
        });

        test('represents object metadata strategies under a "strategy" key with redacted secrets', function () {
            const redacted = redactRegistrySettings({
                auth: {
                    publish: { type: 'bearer-token', token: 'pub' },
                    metadata: { type: 'bearer-token', token: 'meta-secret' }
                }
            } as unknown as RegistrySettings);

            assert.deepStrictEqual(redacted.auth, {
                publish: { type: 'bearer-token', token: '[redacted]' },
                metadata: { strategy: { type: 'bearer-token', token: '[redacted]' } }
            });
        });
    });
});
