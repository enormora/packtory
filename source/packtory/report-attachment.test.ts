import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PacktoryConfig } from '../config/config.ts';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { createSpyingBroadcaster } from '../test-libraries/result-helpers.ts';
import { emitEffectiveConfigPerPackage, maybeAttachAggregator } from './report-attachment.ts';

function createMinimalConfig(packageNames: readonly string[]): PacktoryConfig {
    return {
        registrySettings: {
            registryUrl: 'https://registry.example.com',
            auth: { type: 'bearer-token', token: 'secret' }
        },
        packages: packageNames.map(function (name) {
            return {
                name,
                roots: { main: { js: `${name}/index.js` } }
            };
        })
    } as unknown as PacktoryConfig;
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
            packageName: 'pkg-a',
            stage: 'resolveAndLink',
            durationMs: 12
        });

        const report = attachment.getReport();
        if (report === undefined) {
            assert.fail('expected a BuildReport');
        }
        assert.deepStrictEqual(report.packages['pkg-a']?.timings, { resolveAndLink: 12 });
    });

    test('maybeAttachAggregator() dispose unsubscribes the aggregator', function () {
        const broadcaster = createProgressBroadcaster();

        const attachment = maybeAttachAggregator(broadcaster, true);
        attachment.dispose();

        assert.strictEqual(broadcaster.provider.hasSubscribers('inputsResolved'), false);
        assert.strictEqual(broadcaster.provider.hasSubscribers('stageTimed'), false);
    });
}

function registerEffectiveConfigEmissionTests(): void {
    test('emitEffectiveConfigPerPackage() does not emit when no subscriber is registered', function () {
        const wrapped = createSpyingBroadcaster();

        emitEffectiveConfigPerPackage(wrapped, createMinimalConfig([ 'pkg-a', 'pkg-b' ]));

        assert.strictEqual(wrapped.emitSpy.callCount, 0);
    });

    test('emitEffectiveConfigPerPackage() emits one effectiveConfigResolved per package when a subscriber is registered', function () {
        const broadcaster = createProgressBroadcaster();
        const received: string[] = [];
        broadcaster.consumer.on('effectiveConfigResolved', function (payload) {
            received.push(payload.packageName);
        });

        emitEffectiveConfigPerPackage(broadcaster, createMinimalConfig([ 'pkg-a', 'pkg-b' ]));

        assert.deepStrictEqual(received, [ 'pkg-a', 'pkg-b' ]);
    });

    test('emitEffectiveConfigPerPackage() emits a redacted config with the package name', function () {
        const broadcaster = createProgressBroadcaster();
        const received: { readonly packageName: string; readonly configName: string; }[] = [];
        broadcaster.consumer.on('effectiveConfigResolved', function (payload) {
            received.push({ packageName: payload.packageName, configName: String(payload.config.name) });
        });

        emitEffectiveConfigPerPackage(broadcaster, createMinimalConfig([ 'only-pkg' ]));

        assert.deepStrictEqual(received, [ { packageName: 'only-pkg', configName: 'only-pkg' } ]);
    });
}

suite('report-attachment', function () {
    registerAggregatorAttachmentTests();
    registerEffectiveConfigEmissionTests();
});
