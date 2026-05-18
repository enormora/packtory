import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Maybe } from 'true-myth';
import type { BuildAndPublishOptions } from '../map-config.ts';
import { determineBuildVersion, inferVersionTrigger, shouldIncreaseVersion } from './version-trigger.ts';

function automaticOptions(minimumVersion?: string): BuildAndPublishOptions {
    return { versioning: { automatic: true, minimumVersion } } as unknown as BuildAndPublishOptions;
}

function pinnedOptions(version: string): BuildAndPublishOptions {
    return { versioning: { automatic: false, version } } as unknown as BuildAndPublishOptions;
}

suite('version-trigger', function () {
    test('determineBuildVersion returns the current version when the registry already has one', function () {
        assert.strictEqual(determineBuildVersion(Maybe.just('1.0.0'), automaticOptions()), '1.0.0');
    });

    test('determineBuildVersion returns the pinned version when automatic is disabled and no current version exists', function () {
        assert.strictEqual(determineBuildVersion(Maybe.nothing<string>(), pinnedOptions('2.0.0')), '2.0.0');
    });

    test('determineBuildVersion returns the minimum version when automatic is enabled and no current version exists', function () {
        assert.strictEqual(determineBuildVersion(Maybe.nothing<string>(), automaticOptions('0.1.0')), '0.1.0');
    });

    test('determineBuildVersion defaults to "0.0.0" when automatic and no minimum version is set', function () {
        assert.strictEqual(determineBuildVersion(Maybe.nothing<string>(), automaticOptions()), '0.0.0');
    });

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
});
