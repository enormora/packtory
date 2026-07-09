import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { RegistrySettings } from '../../config/registry-settings.ts';
import { assertTarballOriginMatchesRegistry } from './validate-tarball-host.ts';

const bearerAuth = { type: 'bearer-token', token: 'tok' } as const;

function expectError(callback: () => void, expectedMessage: string): void {
    try {
        callback();
        assert.fail('Expected assertTarballOriginMatchesRegistry() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

suite('validate-tarball-host', function () {
    test('accepts a tarball URL whose host matches the default npm registry', function () {
        const settings: RegistrySettings = { auth: bearerAuth };

        assertTarballOriginMatchesRegistry('https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz', settings);

        assert.strictEqual(settings.auth, bearerAuth);
    });

    test('accepts a tarball URL whose host matches a configured custom registry', function () {
        const settings: RegistrySettings = {
            registryUrl: 'https://registry.example.test/path/',
            auth: bearerAuth
        };

        assertTarballOriginMatchesRegistry('https://registry.example.test/pkg/-/pkg-1.0.0.tgz', settings);

        assert.strictEqual(settings.registryUrl, 'https://registry.example.test/path/');
    });

    test('rejects a tarball URL whose host differs from the default npm registry', function () {
        const settings: RegistrySettings = { auth: bearerAuth };

        const expectedMessage =
            'Refusing to download tarball from "https://attacker.example" because it differs from the configured ' +
            'registry origin "https://registry.npmjs.org". A tampered registry response could redirect the request and ' +
            'exfiltrate publish credentials.';
        expectError(function () {
            assertTarballOriginMatchesRegistry('https://attacker.example/pkg-1.0.0.tgz', settings);
        }, expectedMessage);
    });

    test('rejects a tarball URL whose host differs from a configured custom registry', function () {
        const settings: RegistrySettings = {
            registryUrl: 'https://registry.example.test/',
            auth: bearerAuth
        };

        const expectedMessage =
            'Refusing to download tarball from "https://registry.npmjs.org" because it differs from the configured ' +
            'registry origin "https://registry.example.test". A tampered registry response could redirect the request and ' +
            'exfiltrate publish credentials.';
        expectError(function () {
            assertTarballOriginMatchesRegistry('https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz', settings);
        }, expectedMessage);
    });

    test('rejects a tarball URL whose host has a different port than the configured registry', function () {
        const settings: RegistrySettings = {
            registryUrl: 'https://registry.example.test/',
            auth: bearerAuth
        };

        const expectedMessage =
            'Refusing to download tarball from "https://registry.example.test:8443" because it differs from the configured ' +
            'registry origin "https://registry.example.test". A tampered registry response could redirect the request and ' +
            'exfiltrate publish credentials.';
        expectError(function () {
            assertTarballOriginMatchesRegistry('https://registry.example.test:8443/pkg-1.0.0.tgz', settings);
        }, expectedMessage);
    });

    test('rejects a malformed tarball URL', function () {
        const settings: RegistrySettings = { auth: bearerAuth };

        expectError(function () {
            assertTarballOriginMatchesRegistry('not-a-url', settings);
        }, 'Registry returned an invalid tarball URL: "not-a-url"');
    });

    test('rejects an empty tarball URL', function () {
        const settings: RegistrySettings = { auth: bearerAuth };

        expectError(function () {
            assertTarballOriginMatchesRegistry('', settings);
        }, 'Registry returned an invalid tarball URL: ""');
    });
});
