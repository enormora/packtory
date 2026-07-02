import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Maybe } from 'true-myth';
import type { VersionProviderInput } from '../../config/manual-versioning-settings.ts';
import type { BuildAndPublishOptions } from '../map-config.ts';
import {
    determineBuildVersion,
    inferVersionTrigger,
    shouldIncreaseVersion,
    type VersionProviderContext
} from './version-trigger.ts';

type ManualVersionProvider = (input: VersionProviderInput) => Promise<string> | string;

function automaticOptions(minimumVersion?: string): BuildAndPublishOptions {
    return { versioning: { automatic: true, minimumVersion } } as unknown as BuildAndPublishOptions;
}

function pinnedOptions(version: string): BuildAndPublishOptions {
    return { versioning: { automatic: false, version } } as unknown as BuildAndPublishOptions;
}

function providerOptions(provideVersion: ManualVersionProvider): BuildAndPublishOptions {
    return {
        name: 'pkg-a',
        versioning: { automatic: false, provideVersion }
    } as unknown as BuildAndPublishOptions;
}

function providerContext(): VersionProviderContext {
    return {
        ignoredAttributionPaths: [ 'CHANGELOG.md' ],
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        stage: false,
        targetSourceFiles: [ 'source/index.ts' ]
    };
}

function registerDetermineBuildVersionTests(): void {
    test('determineBuildVersion returns the current version when the registry already has one', async function () {
        assert.strictEqual(
            await determineBuildVersion(Maybe.just('1.0.0'), automaticOptions(), providerContext()),
            '1.0.0'
        );
    });

    test('determineBuildVersion returns the pinned version when automatic is disabled and no current version exists', async function () {
        assert.strictEqual(
            await determineBuildVersion(Maybe.nothing<string>(), pinnedOptions('2.0.0'), providerContext()),
            '2.0.0'
        );
    });

    test('determineBuildVersion returns the minimum version when automatic is enabled and no current version exists', async function () {
        assert.strictEqual(
            await determineBuildVersion(Maybe.nothing<string>(), automaticOptions('0.1.0'), providerContext()),
            '0.1.0'
        );
    });

    test('determineBuildVersion defaults to "0.0.0" when automatic and no minimum version is set', async function () {
        assert.strictEqual(
            await determineBuildVersion(Maybe.nothing<string>(), automaticOptions(), providerContext()),
            '0.0.0'
        );
    });

    test('determineBuildVersion calls async manual providers with package attribution context', async function () {
        const providerInput: unknown[] = [];
        const version = await determineBuildVersion(
            Maybe.just('1.0.0'),
            providerOptions(async function (input) {
                providerInput.push(input);
                return '1.0.1';
            }),
            providerContext()
        );

        assert.strictEqual(version, '1.0.1');
        assert.deepStrictEqual(providerInput, [
            {
                packageName: 'pkg-a',
                currentVersion: '1.0.0',
                ignoredAttributionPaths: [ 'CHANGELOG.md' ],
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                stage: false,
                targetSourceFiles: [ 'source/index.ts' ]
            }
        ]);
    });

    test('determineBuildVersion rejects empty provider versions', async function () {
        await assert.rejects(
            async function () {
                await determineBuildVersion(
                    Maybe.just('1.0.0'),
                    providerOptions(function () {
                        return '';
                    }),
                    providerContext()
                );
            },
            { message: 'Manual version provider must return a non-empty string' }
        );
    });
}

function registerVersionTriggerTests(): void {
    test('shouldIncreaseVersion returns false when automatic versioning is disabled', function () {
        assert.strictEqual(shouldIncreaseVersion(Maybe.just('1.0.0'), pinnedOptions('2.0.0')), false);
    });

    test('shouldIncreaseVersion returns true when automatic and the current version is known', function () {
        assert.strictEqual(shouldIncreaseVersion(Maybe.just('1.0.0'), automaticOptions()), true);
    });

    test('shouldIncreaseVersion returns false when automatic and no current version exists but a minimum is set', function () {
        assert.strictEqual(shouldIncreaseVersion(Maybe.nothing<string>(), automaticOptions('0.1.0')), false);
    });

    test('shouldIncreaseVersion returns true when automatic and no current version and no minimum is set', function () {
        assert.strictEqual(shouldIncreaseVersion(Maybe.nothing<string>(), automaticOptions()), true);
    });

    test('inferVersionTrigger returns auto-patch-bump when the version was bumped', function () {
        assert.strictEqual(inferVersionTrigger(Maybe.just('1.0.0'), automaticOptions(), true), 'auto-patch-bump');
    });

    test('inferVersionTrigger treats didBump as authoritative even for pinned options', function () {
        assert.strictEqual(
            inferVersionTrigger(Maybe.nothing<string>(), pinnedOptions('2.0.0'), true),
            'auto-patch-bump'
        );
    });

    test('inferVersionTrigger returns pinned when automatic versioning is disabled and no bump occurred', function () {
        assert.strictEqual(inferVersionTrigger(Maybe.just('1.0.0'), pinnedOptions('2.0.0'), false), 'pinned');
    });

    test('inferVersionTrigger returns auto-patch-bump when the current version exists but no bump occurred', function () {
        assert.strictEqual(inferVersionTrigger(Maybe.just('1.0.0'), automaticOptions(), false), 'auto-patch-bump');
    });

    test('inferVersionTrigger returns minimum when automatic, no current version, and a minimum is configured', function () {
        assert.strictEqual(inferVersionTrigger(Maybe.nothing<string>(), automaticOptions('0.1.0'), false), 'minimum');
    });

    test('inferVersionTrigger returns initial when automatic and no current version and no minimum is configured', function () {
        assert.strictEqual(inferVersionTrigger(Maybe.nothing<string>(), automaticOptions(), false), 'initial');
    });
}

suite('version-trigger', function () {
    registerDetermineBuildVersionTests();
    registerVersionTriggerTests();
});
