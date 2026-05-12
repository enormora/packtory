import assert from 'node:assert';
import { test } from 'mocha';
import type { RegistrySettings } from './registry-settings.ts';
import { redactRegistrySettings } from './registry-settings.report.ts';

test('redacts a bearer-token auth', () => {
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

test('redacts a basic auth password but preserves username and email', () => {
    const settings = {
        auth: { type: 'basic', username: 'alice', password: 'real-secret', email: 'alice@example.com' }
    } as unknown as RegistrySettings;

    const redacted = redactRegistrySettings(settings);

    assert.deepStrictEqual(redacted, {
        auth: { type: 'basic', username: 'alice', password: '[redacted]', email: 'alice@example.com' }
    });
});

test('preserves npm-oidc provider and idTokenEnvVar - no secrets to redact', () => {
    const settings = {
        auth: { type: 'npm-oidc', provider: 'github-actions', idTokenEnvVar: 'NPM_ID_TOKEN' }
    } as unknown as RegistrySettings;

    const redacted = redactRegistrySettings(settings);

    assert.deepStrictEqual(redacted, {
        auth: { type: 'npm-oidc', provider: 'github-actions', idTokenEnvVar: 'NPM_ID_TOKEN' }
    });
});

test('redacts both publish and metadata when auth is expanded', () => {
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
