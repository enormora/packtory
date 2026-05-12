import assert from 'node:assert';
import { test } from 'mocha';
import { fake } from 'sinon';
import type { PackageProcessor } from '../packtory/package-processor.ts';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { withStageTimings } from './decorators.ts';

function createPlainProcessor(overrides: Partial<PackageProcessor> = {}): PackageProcessor {
    return {
        resolveAndLink:
            overrides.resolveAndLink ?? (fake.resolves({}) as unknown as PackageProcessor['resolveAndLink']),
        build: overrides.build ?? (fake.resolves({}) as unknown as PackageProcessor['build']),
        buildAndPublish:
            overrides.buildAndPublish ?? (fake.resolves({}) as unknown as PackageProcessor['buildAndPublish']),
        tryBuildAndPublish:
            overrides.tryBuildAndPublish ?? (fake.resolves({}) as unknown as PackageProcessor['tryBuildAndPublish'])
    };
}

test('withStageTimings emits a stageTimed event on resolveAndLink', async () => {
    const broadcaster = createProgressBroadcaster();
    const received: unknown[] = [];
    broadcaster.consumer.on('stageTimed', (payload) => {
        received.push(payload);
    });

    const wrapped = withStageTimings(createPlainProcessor(), broadcaster.provider);
    await wrapped.resolveAndLink({ name: 'pkg-a' } as unknown as Parameters<PackageProcessor['resolveAndLink']>[0]);

    assert.strictEqual(received.length, 1);
    const [payload] = received as readonly { packageName: string; stage: string; durationMs: number }[];
    if (payload === undefined) {
        assert.fail('expected one payload');
    }
    assert.strictEqual(payload.packageName, 'pkg-a');
    assert.strictEqual(payload.stage, 'resolveAndLink');
    assert.ok(typeof payload.durationMs === 'number' && payload.durationMs >= 0);
});

test('withStageTimings emits stage "publish" for buildAndPublish using buildOptions.name', async () => {
    const broadcaster = createProgressBroadcaster();
    const received: { stage: string; packageName: string }[] = [];
    broadcaster.consumer.on('stageTimed', (payload) => {
        received.push({ stage: payload.stage, packageName: payload.packageName });
    });

    const wrapped = withStageTimings(createPlainProcessor(), broadcaster.provider);
    await wrapped.buildAndPublish({ buildOptions: { name: 'pkg-b' } } as unknown as Parameters<
        PackageProcessor['buildAndPublish']
    >[0]);

    assert.deepStrictEqual(received, [{ stage: 'publish', packageName: 'pkg-b' }]);
});

test('withStageTimings emits stage "tryPublish" for tryBuildAndPublish', async () => {
    const broadcaster = createProgressBroadcaster();
    const received: string[] = [];
    broadcaster.consumer.on('stageTimed', (payload) => {
        received.push(payload.stage);
    });

    const wrapped = withStageTimings(createPlainProcessor(), broadcaster.provider);
    await wrapped.tryBuildAndPublish({ buildOptions: { name: 'pkg-c' } } as unknown as Parameters<
        PackageProcessor['tryBuildAndPublish']
    >[0]);

    assert.deepStrictEqual(received, ['tryPublish']);
});

test('withStageTimings still emits when the wrapped method rejects', async () => {
    const broadcaster = createProgressBroadcaster();
    const received: string[] = [];
    broadcaster.consumer.on('stageTimed', (payload) => {
        received.push(payload.stage);
    });

    const wrapped = withStageTimings(
        createPlainProcessor({
            resolveAndLink: fake.rejects(new Error('boom')) as unknown as PackageProcessor['resolveAndLink']
        }),
        broadcaster.provider
    );

    try {
        await wrapped.resolveAndLink({ name: 'pkg-d' } as unknown as Parameters<PackageProcessor['resolveAndLink']>[0]);
        assert.fail('expected resolveAndLink to throw');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'boom');
    }
    assert.deepStrictEqual(received, ['resolveAndLink']);
});

test('withStageTimings skips emit when no subscriber is registered', async () => {
    const broadcaster = createProgressBroadcaster();
    const emitSpy = fake();
    const wrappedProvider = {
        emit: (eventName: Parameters<typeof broadcaster.provider.emit>[0], payload: unknown): void => {
            emitSpy(eventName, payload);
            broadcaster.provider.emit(eventName, payload as never);
        },
        hasSubscribers: broadcaster.provider.hasSubscribers
    };

    const wrapped = withStageTimings(createPlainProcessor(), wrappedProvider);
    await wrapped.resolveAndLink({ name: 'pkg-e' } as unknown as Parameters<PackageProcessor['resolveAndLink']>[0]);

    assert.strictEqual(emitSpy.callCount, 0);
});

test('withStageTimings forwards the wrapped method return value', async () => {
    const broadcaster = createProgressBroadcaster();
    const sentinel = { sentinel: true };
    const wrapped = withStageTimings(
        createPlainProcessor({
            build: fake.resolves(sentinel) as unknown as PackageProcessor['build']
        }),
        broadcaster.provider
    );

    const result = await wrapped.build({ name: 'pkg-f' } as unknown as Parameters<PackageProcessor['build']>[0]);
    assert.strictEqual(result, sentinel);
});
