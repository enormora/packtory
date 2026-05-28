import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PacktoryConfig } from '../config/config.ts';
import { redactConfigForPackage } from './config-redactor.ts';

function baseConfig(overrides: Partial<PacktoryConfig> = {}): PacktoryConfig {
    return {
        registrySettings: {
            registryUrl: 'https://registry.example.com',
            auth: { type: 'bearer-token', token: 'secret' }
        },
        packages: [],
        ...overrides
    } as unknown as PacktoryConfig;
}

suite('config-redactor', function () {
    test('redactConfigForPackage() returns the package name', function () {
        const redacted = redactConfigForPackage(baseConfig(), 'pkg-a');

        assert.strictEqual(redacted.name, 'pkg-a');
    });

    test('redactConfigForPackage() always redacts the registry settings', function () {
        const redacted = redactConfigForPackage(baseConfig(), 'pkg-a');

        assert.deepStrictEqual(redacted.registrySettings, {
            registryUrl: 'https://registry.example.com',
            auth: { type: 'bearer-token', token: '[redacted]' }
        });
    });

    test('redactConfigForPackage() omits publishSettings when neither package nor common defines it', function () {
        const redacted = redactConfigForPackage(
            baseConfig({
                packages: [
                    {
                        name: 'pkg-a',
                        roots: { main: { js: 'pkg-a/index.js' } }
                    }
                ]
            } as unknown as Partial<PacktoryConfig>),
            'pkg-a'
        );

        assert.strictEqual('publishSettings' in redacted, false);
    });

    test('redactConfigForPackage() uses package publishSettings when present', function () {
        const redacted = redactConfigForPackage(
            baseConfig({
                packages: [
                    {
                        name: 'pkg-a',
                        roots: { main: { js: 'pkg-a/index.js' } },
                        publishSettings: { access: 'restricted', allowScripts: true }
                    }
                ]
            } as unknown as Partial<PacktoryConfig>),
            'pkg-a'
        );

        assert.deepStrictEqual(redacted.publishSettings, { access: 'restricted', allowScripts: true });
    });

    test('redactConfigForPackage() falls back to commonPackageSettings.publishSettings when the package omits it', function () {
        const redacted = redactConfigForPackage(
            baseConfig({
                commonPackageSettings: { publishSettings: { access: 'public' } },
                packages: [{ name: 'pkg-a', roots: { main: { js: 'pkg-a/index.js' } } }]
            } as unknown as Partial<PacktoryConfig>),
            'pkg-a'
        );

        assert.deepStrictEqual(redacted.publishSettings, { access: 'public' });
    });

    test('redactConfigForPackage() prefers package publishSettings over commonPackageSettings', function () {
        const redacted = redactConfigForPackage(
            baseConfig({
                commonPackageSettings: { publishSettings: { access: 'public' } },
                packages: [
                    {
                        name: 'pkg-a',
                        roots: { main: { js: 'pkg-a/index.js' } },
                        publishSettings: { access: 'restricted' }
                    }
                ]
            } as unknown as Partial<PacktoryConfig>),
            'pkg-a'
        );

        assert.deepStrictEqual(redacted.publishSettings, { access: 'restricted' });
    });

    test('redactConfigForPackage() omits sourcesFolder when neither package nor common defines it', function () {
        const redacted = redactConfigForPackage(
            baseConfig({
                packages: [{ name: 'pkg-a', roots: { main: { js: 'pkg-a/index.js' } } }]
            } as unknown as Partial<PacktoryConfig>),
            'pkg-a'
        );

        assert.strictEqual('sourcesFolder' in redacted, false);
    });

    test('redactConfigForPackage() prefers package sourcesFolder over commonPackageSettings', function () {
        const redacted = redactConfigForPackage(
            baseConfig({
                commonPackageSettings: { sourcesFolder: '/common/src' },
                packages: [{ name: 'pkg-a', roots: { main: { js: 'pkg-a/index.js' } }, sourcesFolder: '/pkg-a/src' }]
            } as unknown as Partial<PacktoryConfig>),
            'pkg-a'
        );

        assert.strictEqual(redacted.sourcesFolder, '/pkg-a/src');
    });

    test('redactConfigForPackage() falls back to commonPackageSettings.sourcesFolder when the package omits it', function () {
        const redacted = redactConfigForPackage(
            baseConfig({
                commonPackageSettings: { sourcesFolder: '/common/src' },
                packages: [{ name: 'pkg-a', roots: { main: { js: 'pkg-a/index.js' } } }]
            } as unknown as Partial<PacktoryConfig>),
            'pkg-a'
        );

        assert.strictEqual(redacted.sourcesFolder, '/common/src');
    });

    test('redactConfigForPackage() returns undefined publishSettings and sourcesFolder when the package name does not match', function () {
        const redacted = redactConfigForPackage(
            baseConfig({
                packages: [
                    {
                        name: 'pkg-a',
                        roots: { main: { js: 'pkg-a/index.js' } },
                        publishSettings: { access: 'restricted' },
                        sourcesFolder: '/pkg-a/src'
                    }
                ]
            } as unknown as Partial<PacktoryConfig>),
            'pkg-missing'
        );

        assert.strictEqual('publishSettings' in redacted, false);
        assert.strictEqual('sourcesFolder' in redacted, false);
        assert.strictEqual(redacted.name, 'pkg-missing');
    });

    test('redactConfigForPackage() omits registrySettings when the config does not define them', function () {
        const redacted = redactConfigForPackage(
            { packages: [{ name: 'pkg-a', roots: { main: { js: 'pkg-a/index.js' } } }] } as unknown as PacktoryConfig,
            'pkg-a'
        );

        assert.strictEqual('registrySettings' in redacted, false);
    });

    test('redactConfigForPackage() falls back to common settings when the package name does not match but common settings exist', function () {
        const redacted = redactConfigForPackage(
            baseConfig({
                commonPackageSettings: {
                    publishSettings: { access: 'public' },
                    sourcesFolder: '/common/src'
                },
                packages: []
            } as unknown as Partial<PacktoryConfig>),
            'pkg-missing'
        );

        assert.deepStrictEqual(redacted.publishSettings, { access: 'public' });
        assert.strictEqual(redacted.sourcesFolder, '/common/src');
    });
});
