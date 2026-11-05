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
    test('disabled reporting runs the operation and leaves report collection disabled', async function () {
        const broadcaster = createProgressBroadcaster();
        const attachment = maybeAttachAggregator(broadcaster, false);
        const result = await attachment.run(function () {
            broadcaster.provider.emit('stageTimed', {
                packageName: 'ignored',
                stage: 'build',
                durationMilliseconds: 12
            });
            return 42;
        });
        assert.strictEqual(result, 42);
        assert.strictEqual(attachment.getReport(), undefined);
        assert.strictEqual(broadcaster.provider.hasSubscribers('stageTimed'), false);
    });

    test('report collection is active only within its operation', async function () {
        const broadcaster = createProgressBroadcaster();
        const attachment = maybeAttachAggregator(broadcaster, true);
        assert.strictEqual(broadcaster.provider.hasSubscribers('stageTimed'), false);
        await attachment.run(function () {
            assert.strictEqual(broadcaster.provider.hasSubscribers('stageTimed'), true);
            assert.strictEqual(broadcaster.provider.hasSubscribers('scheduled'), false);
            broadcaster.provider.emit('stageTimed', {
                packageName: 'package-a',
                stage: 'build',
                durationMilliseconds: 12
            });
        });
        broadcaster.provider.emit('stageTimed', { packageName: 'outside', stage: 'build', durationMilliseconds: 99 });
        assert.deepStrictEqual(attachment.getReport()?.packages, {
            'package-a': { decisions: {}, timings: { build: 12 } }
        });
        assert.strictEqual(broadcaster.provider.hasSubscribers('stageTimed'), false);
    });

    test('report scope ends when an operation throws', async function () {
        const broadcaster = createProgressBroadcaster();
        const attachment = maybeAttachAggregator(broadcaster, true);
        const failure = new Error('operation failed');
        await assert.rejects(
            attachment.run(function () {
                throw failure;
            }),
            failure
        );
        assert.strictEqual(broadcaster.provider.hasSubscribers('stageTimed'), false);
    });

    test('overlapping asynchronous operations collect their own report events', async function () {
        const broadcaster = createProgressBroadcaster();
        const first = maybeAttachAggregator(broadcaster, true);
        const second = maybeAttachAggregator(broadcaster, true);
        const gate = Promise.withResolvers<undefined>();
        const pending = first.run(async function () {
            await gate.promise;
            broadcaster.provider.emit('stageTimed', { packageName: 'first', stage: 'build', durationMilliseconds: 12 });
        });
        await second.run(async function () {
            await Promise.resolve();
            broadcaster.provider.emit('stageTimed', {
                packageName: 'second',
                stage: 'build',
                durationMilliseconds: 24
            });
            gate.resolve(undefined);
        });
        await pending;
        assert.deepStrictEqual(first.getReport()?.packages, { first: { decisions: {}, timings: { build: 12 } } });
        assert.deepStrictEqual(second.getReport()?.packages, { second: { decisions: {}, timings: { build: 24 } } });
    });

    test('asynchronous work that outlives an operation cannot add to its completed report', async function () {
        const broadcaster = createProgressBroadcaster();
        const attachment = maybeAttachAggregator(broadcaster, true);
        const gate = Promise.withResolvers<undefined>();
        async function emitWhenReleased(): Promise<boolean> {
            await gate.promise;
            broadcaster.provider.emit('stageTimed', { packageName: 'late', stage: 'build', durationMilliseconds: 12 });
            return broadcaster.provider.hasSubscribers('stageTimed');
        }
        const work = await attachment.run(function () {
            return { pending: emitWhenReleased() };
        });
        gate.resolve(undefined);
        assert.strictEqual(await work.pending, false);
        assert.deepStrictEqual(attachment.getReport()?.packages, {});
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
