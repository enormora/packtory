import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PacktoryConfiguration } from '../configuration/configuration.ts';
import { redactConfigurationForPackage } from './configuration-redactor.ts';

function baseConfiguration(overrides: Partial<PacktoryConfiguration> = {}): PacktoryConfiguration {
    return {
        registrySettings: {
            registryAddress: 'https://registry.example.com',
            authentication: { type: 'bearer-token', token: 'secret' }
        },
        packages: [],
        ...overrides
    } as unknown as PacktoryConfiguration;
}

function registerPublishSettingTests(): void {
    test('redactConfigurationForPackage() returns the package name', function () {
        const redacted = redactConfigurationForPackage(baseConfiguration(), 'package-a');

        assert.strictEqual(redacted.name, 'package-a');
    });

    test('redactConfigurationForPackage() always redacts the registry settings', function () {
        const redacted = redactConfigurationForPackage(baseConfiguration(), 'package-a');

        assert.deepStrictEqual(redacted.registrySettings, {
            registryAddress: 'https://registry.example.com',
            authentication: { type: 'bearer-token', token: '[redacted]' }
        });
    });

    test('redactConfigurationForPackage() omits publishSettings when neither package nor common defines it', function () {
        const redacted = redactConfigurationForPackage(
            baseConfiguration({
                packages: [
                    {
                        name: 'package-a',
                        roots: { main: { javaScript: 'package-a/index.js' } }
                    }
                ]
            }),
            'package-a'
        );

        assert.strictEqual(Object.hasOwn(redacted, 'publishSettings'), false);
    });

    test('redactConfigurationForPackage() uses package publishSettings when present', function () {
        const redacted = redactConfigurationForPackage(
            baseConfiguration({
                packages: [
                    {
                        name: 'package-a',
                        roots: { main: { javaScript: 'package-a/index.js' } },
                        publishSettings: { access: 'restricted', allowScripts: true }
                    }
                ]
            } as unknown as Partial<PacktoryConfiguration>),
            'package-a'
        );

        assert.deepStrictEqual(redacted.publishSettings, { access: 'restricted', allowScripts: true });
    });

    test('redactConfigurationForPackage() falls back to commonPackageSettings.publishSettings when the package omits it', function () {
        const redacted = redactConfigurationForPackage(
            baseConfiguration({
                commonPackageSettings: { publishSettings: { access: 'public' } },
                packages: [ { name: 'package-a', roots: { main: { javaScript: 'package-a/index.js' } } } ]
            } as unknown as Partial<PacktoryConfiguration>),
            'package-a'
        );

        assert.deepStrictEqual(redacted.publishSettings, { access: 'public' });
    });

    test('redactConfigurationForPackage() prefers package publishSettings over commonPackageSettings', function () {
        const redacted = redactConfigurationForPackage(
            baseConfiguration({
                commonPackageSettings: { publishSettings: { access: 'public' } },
                packages: [
                    {
                        name: 'package-a',
                        roots: { main: { javaScript: 'package-a/index.js' } },
                        publishSettings: { access: 'restricted' }
                    }
                ]
            } as unknown as Partial<PacktoryConfiguration>),
            'package-a'
        );

        assert.deepStrictEqual(redacted.publishSettings, { access: 'restricted' });
    });
}

function registerSourceAndRegistryTests(): void {
    test('redactConfigurationForPackage() omits sourcesFolder when neither package nor common defines it', function () {
        const redacted = redactConfigurationForPackage(
            baseConfiguration({
                packages: [ { name: 'package-a', roots: { main: { javaScript: 'package-a/index.js' } } } ]
            }),
            'package-a'
        );

        assert.strictEqual(Object.hasOwn(redacted, 'sourcesFolder'), false);
    });

    test('redactConfigurationForPackage() prefers package sourcesFolder over commonPackageSettings', function () {
        const redacted = redactConfigurationForPackage(
            baseConfiguration({
                commonPackageSettings: { sourcesFolder: '/common/source' },
                packages: [ {
                    name: 'package-a',
                    roots: { main: { javaScript: 'package-a/index.js' } },
                    sourcesFolder: '/package-a/source'
                } ]
            }),
            'package-a'
        );

        assert.strictEqual(redacted.sourcesFolder, '/package-a/source');
    });

    test('redactConfigurationForPackage() falls back to commonPackageSettings.sourcesFolder when the package omits it', function () {
        const redacted = redactConfigurationForPackage(
            baseConfiguration({
                commonPackageSettings: { sourcesFolder: '/common/source' },
                packages: [ { name: 'package-a', roots: { main: { javaScript: 'package-a/index.js' } } } ]
            }),
            'package-a'
        );

        assert.strictEqual(redacted.sourcesFolder, '/common/source');
    });

    test('redactConfigurationForPackage() returns undefined publishSettings and sourcesFolder when the package name does not match', function () {
        const redacted = redactConfigurationForPackage(
            baseConfiguration({
                packages: [
                    {
                        name: 'package-a',
                        roots: { main: { javaScript: 'package-a/index.js' } },
                        publishSettings: { access: 'restricted' },
                        sourcesFolder: '/package-a/source'
                    }
                ]
            } as unknown as Partial<PacktoryConfiguration>),
            'package-missing'
        );

        assert.strictEqual(Object.hasOwn(redacted, 'publishSettings'), false);
        assert.strictEqual(Object.hasOwn(redacted, 'sourcesFolder'), false);
        assert.strictEqual(redacted.name, 'package-missing');
    });

    test('redactConfigurationForPackage() omits registrySettings when the config does not define them', function () {
        const redacted = redactConfigurationForPackage(
            { packages: [ { name: 'package-a', roots: { main: { javaScript: 'package-a/index.js' } } } ] },
            'package-a'
        );

        assert.strictEqual(Object.hasOwn(redacted, 'registrySettings'), false);
    });

    test('redactConfigurationForPackage() falls back to common settings when the package name does not match but common settings exist', function () {
        const redacted = redactConfigurationForPackage(
            baseConfiguration({
                commonPackageSettings: {
                    publishSettings: { access: 'public' },
                    sourcesFolder: '/common/source'
                },
                packages: []
            } as unknown as Partial<PacktoryConfiguration>),
            'package-missing'
        );

        assert.partialDeepStrictEqual(redacted, {
            publishSettings: { access: 'public' },
            sourcesFolder: '/common/source'
        });
    });
}

suite('config-redactor', function () {
    registerPublishSettingTests();
    registerSourceAndRegistryTests();
});
