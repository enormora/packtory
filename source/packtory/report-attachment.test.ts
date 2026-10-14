import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PacktoryConfiguration } from '../configuration/configuration.ts';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { createSpyingBroadcaster } from '../test-libraries/result-helpers.ts';
import { emitEffectiveConfigurationPerPackage, maybeAttachAggregator } from './report-attachment.ts';

function createMinimalConfiguration(packageNames: readonly string[]): PacktoryConfiguration {
    return {
        registrySettings: {
            registryAddress: 'https://registry.example.com',
            authentication: { type: 'bearer-token', token: 'secret' }
        },
        packages: packageNames.map(function (name) {
            return {
                name,
                roots: { main: { javaScript: `${name}/index.js` } }
            };
        })
    } as unknown as PacktoryConfiguration;
}

function registerAggregatorAttachmentTests(): void {
    test('maybeAttachAggregator() returns no-op getReport when collectReport is undefined', function () {
        const broadcaster = createProgressBroadcaster();

        const attachment = maybeAttachAggregator(broadcaster, undefined);

        assert.strictEqual(attachment.getReport(), undefined);
    });

    test('maybeAttachAggregator() returns no-op getReport when collectReport is false', function () {
        const broadcaster = createProgressBroadcaster();

        const attachment = maybeAttachAggregator(broadcaster, false);

        assert.strictEqual(attachment.getReport(), undefined);
    });

    test('maybeAttachAggregator() no-op dispose is callable without throwing when collectReport is false', function () {
        const broadcaster = createProgressBroadcaster();

        const attachment = maybeAttachAggregator(broadcaster, false);

        attachment.dispose();

        assert.strictEqual(attachment.getReport(), undefined);
    });

    test('maybeAttachAggregator() does not subscribe to broadcaster when collectReport is false', function () {
        const broadcaster = createProgressBroadcaster();

        maybeAttachAggregator(broadcaster, false);

        assert.strictEqual(broadcaster.provider.hasSubscribers('inputsResolved'), false);
        assert.strictEqual(broadcaster.provider.hasSubscribers('stageTimed'), false);
    });

    test('maybeAttachAggregator() subscribes to broadcaster events when collectReport is true', function () {
        const broadcaster = createProgressBroadcaster();

        maybeAttachAggregator(broadcaster, true);

        assert.strictEqual(broadcaster.provider.hasSubscribers('inputsResolved'), true);
        assert.strictEqual(broadcaster.provider.hasSubscribers('stageTimed'), true);
    });

    test('maybeAttachAggregator() getReport returns a materialized BuildReport when collectReport is true', function () {
        const broadcaster = createProgressBroadcaster();

        const attachment = maybeAttachAggregator(broadcaster, true);
        const report = attachment.getReport();

        if (report === undefined) {
            assert.fail('expected a BuildReport');
        }
        assert.partialDeepStrictEqual(report, {
            schemaVersion: 1,
            packages: {},
            aggregate: { crossBundleLinks: [] }
        });
    });

    test('maybeAttachAggregator() getReport reflects events emitted before build', function () {
        const broadcaster = createProgressBroadcaster();

        const attachment = maybeAttachAggregator(broadcaster, true);
        broadcaster.provider.emit('stageTimed', {
            packageName: 'package-a',
            stage: 'resolveAndLink',
            durationMilliseconds: 12
        });

        const report = attachment.getReport();
        if (report === undefined) {
            assert.fail('expected a BuildReport');
        }
        assert.deepStrictEqual(report.packages['package-a']?.timings, { resolveAndLink: 12 });
    });

    test('maybeAttachAggregator() dispose unsubscribes the aggregator', function () {
        const broadcaster = createProgressBroadcaster();

        const attachment = maybeAttachAggregator(broadcaster, true);
        attachment.dispose();

        assert.strictEqual(broadcaster.provider.hasSubscribers('inputsResolved'), false);
        assert.strictEqual(broadcaster.provider.hasSubscribers('stageTimed'), false);
    });
}

function registerEffectiveConfigurationEmissionTests(): void {
    test('emitEffectiveConfigurationPerPackage() does not emit when no subscriber is registered', function () {
        const wrapped = createSpyingBroadcaster();

        emitEffectiveConfigurationPerPackage(wrapped, createMinimalConfiguration([ 'package-a', 'package-b' ]));

        assert.strictEqual(wrapped.emitSpy.callCount, 0);
    });

    test('emitEffectiveConfigurationPerPackage() emits one effectiveConfigurationResolved per package when a subscriber is registered', function () {
        const broadcaster = createProgressBroadcaster();
        const received: string[] = [];
        broadcaster.consumer.on('effectiveConfigurationResolved', function (payload) {
            received.push(payload.packageName);
        });

        emitEffectiveConfigurationPerPackage(broadcaster, createMinimalConfiguration([ 'package-a', 'package-b' ]));

        assert.deepStrictEqual(received, [ 'package-a', 'package-b' ]);
    });

    test('emitEffectiveConfigurationPerPackage() emits a redacted config with the package name', function () {
        const broadcaster = createProgressBroadcaster();
        const received: { readonly packageName: string; readonly configurationName: string; }[] = [];
        broadcaster.consumer.on('effectiveConfigurationResolved', function (payload) {
            received.push({ packageName: payload.packageName, configurationName: String(payload.configuration.name) });
        });

        emitEffectiveConfigurationPerPackage(broadcaster, createMinimalConfiguration([ 'only-pkg' ]));

        assert.deepStrictEqual(received, [ { packageName: 'only-pkg', configurationName: 'only-pkg' } ]);
    });
}

suite('report-attachment', function () {
    registerAggregatorAttachmentTests();
    registerEffectiveConfigurationEmissionTests();
});
