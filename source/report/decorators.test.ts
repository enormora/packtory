import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { PackageProcessor } from '../packtory/package-processor.ts';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { createSpyingBroadcaster } from '../test-libraries/result-helpers.ts';
import { withFailureCapture, withStageTimings } from './decorators.ts';

type StageCollector = {
    readonly broadcaster: ProgressBroadcaster;
    readonly stages: readonly string[];
};

type StagePayload = {
    readonly durationMs: number;
    readonly packageName: string;
    readonly stage: string;
};

type StagePayloadCollector = {
    readonly broadcaster: ProgressBroadcaster;
    readonly received: readonly StagePayload[];
};

type FailureInput = {
    readonly name: string;
};

type PackageFailedPayload = {
    readonly message: string;
    readonly packageName: string;
    readonly stage: string;
};

function createPlainProcessor(overrides: Partial<PackageProcessor> = {}): PackageProcessor {
    return {
        resolveAndLink: overrides.resolveAndLink ??
            fake.resolves({} as never),
        build: overrides.build ?? fake.resolves({} as never),
        buildAndPublish: overrides.buildAndPublish ??
            fake.resolves({} as never),
        tryBuildAndPublish: overrides.tryBuildAndPublish ??
            fake.resolves({} as never)
    };
}

function createStageCollector(): StageCollector {
    const broadcaster = createProgressBroadcaster();
    const stages: string[] = [];
    broadcaster.consumer.on('stageTimed', function (payload) {
        stages.push(payload.stage);
    });
    return { broadcaster, stages };
}

function createStagePayloadCollector(): StagePayloadCollector {
    const broadcaster = createProgressBroadcaster();
    const received: StagePayload[] = [];
    broadcaster.consumer.on('stageTimed', function (payload) {
        received.push({
            durationMs: payload.durationMs,
            stage: payload.stage,
            packageName: payload.packageName
        });
    });
    return { broadcaster, received };
}

function expectPayload(received: readonly StagePayload[]): StagePayload {
    const [ payload ] = received;
    if (payload === undefined) {
        assert.fail('expected one payload');
    }
    return payload;
}

function registerStageTimingTests(): void {
    test('withStageTimings emits a stageTimed event on resolveAndLink', async function () {
        const { broadcaster, received } = createStagePayloadCollector();

        const wrapped = withStageTimings(createPlainProcessor(), broadcaster.provider);
        await wrapped.resolveAndLink({ name: 'pkg-a' } as unknown as Parameters<PackageProcessor['resolveAndLink']>[0]);

        assert.strictEqual(received.length, 1);
        const payload = expectPayload(received);
        assert.partialDeepStrictEqual(payload, {
            packageName: 'pkg-a',
            stage: 'resolveAndLink'
        });
        assert.ok(typeof payload.durationMs === 'number' && payload.durationMs >= 0);
    });

    test('withStageTimings emits stage "publish" for buildAndPublish using buildOptions.name', async function () {
        const { broadcaster, received } = createStagePayloadCollector();

        const wrapped = withStageTimings(createPlainProcessor(), broadcaster.provider);
        await wrapped.buildAndPublish(
            { buildOptions: { name: 'pkg-b' } } as unknown as Parameters<
                PackageProcessor['buildAndPublish']
            >[0]
        );

        assert.strictEqual(received.length, 1);
        const payload = expectPayload(received);
        assert.partialDeepStrictEqual(payload, {
            packageName: 'pkg-b',
            stage: 'publish'
        });
        assert.ok(typeof payload.durationMs === 'number' && payload.durationMs >= 0);
    });

    test('withStageTimings.buildAndPublish forwards the wrapped method result', async function () {
        const broadcaster = createProgressBroadcaster();
        const sentinel = { sentinel: 'build-and-publish' };
        const wrapped = withStageTimings(
            createPlainProcessor({
                buildAndPublish: fake.resolves(sentinel) as unknown as PackageProcessor['buildAndPublish']
            }),
            broadcaster.provider
        );

        const result = await wrapped.buildAndPublish(
            { buildOptions: { name: 'pkg-b' } } as unknown as Parameters<
                PackageProcessor['buildAndPublish']
            >[0]
        );

        assert.strictEqual(result, sentinel);
    });

    test('withStageTimings.tryBuildAndPublish forwards the wrapped method result', async function () {
        const broadcaster = createProgressBroadcaster();
        const sentinel = { sentinel: 'try-build-and-publish' };
        const wrapped = withStageTimings(
            createPlainProcessor({
                tryBuildAndPublish: fake.resolves(sentinel) as unknown as PackageProcessor['tryBuildAndPublish']
            }),
            broadcaster.provider
        );

        const result = await wrapped.tryBuildAndPublish(
            { buildOptions: { name: 'pkg-c' } } as unknown as Parameters<
                PackageProcessor['tryBuildAndPublish']
            >[0]
        );

        assert.strictEqual(result, sentinel);
    });

    test('withStageTimings emits stage "tryPublish" for tryBuildAndPublish', async function () {
        const { broadcaster, stages } = createStageCollector();

        const wrapped = withStageTimings(createPlainProcessor(), broadcaster.provider);
        await wrapped.tryBuildAndPublish(
            { buildOptions: { name: 'pkg-c' } } as unknown as Parameters<
                PackageProcessor['tryBuildAndPublish']
            >[0]
        );

        assert.deepStrictEqual(stages, [ 'tryPublish' ]);
    });

    test('withStageTimings still emits when the wrapped method rejects', async function () {
        const { broadcaster, stages } = createStageCollector();

        const wrapped = withStageTimings(
            createPlainProcessor({
                resolveAndLink: fake.rejects(new Error('boom')) as unknown as PackageProcessor['resolveAndLink']
            }),
            broadcaster.provider
        );

        try {
            await wrapped.resolveAndLink(
                { name: 'pkg-d' } as unknown as Parameters<
                    PackageProcessor['resolveAndLink']
                >[0]
            );
            assert.fail('expected resolveAndLink to throw');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'boom');
        }
        assert.deepStrictEqual(stages, [ 'resolveAndLink' ]);
    });

    test('withStageTimings skips emit when no subscriber is registered', async function () {
        const wrappedBroadcaster = createSpyingBroadcaster();

        const wrapped = withStageTimings(createPlainProcessor(), wrappedBroadcaster.provider);
        await wrapped.resolveAndLink({ name: 'pkg-e' } as unknown as Parameters<PackageProcessor['resolveAndLink']>[0]);

        assert.strictEqual(wrappedBroadcaster.emitSpy.callCount, 0);
    });

    test('withStageTimings forwards the wrapped method return value', async function () {
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

    test('withStageTimings emits stage "build" for build using options.name', async function () {
        const { broadcaster, received } = createStagePayloadCollector();

        const wrapped = withStageTimings(createPlainProcessor(), broadcaster.provider);
        await wrapped.build({ name: 'pkg-build' } as unknown as Parameters<PackageProcessor['build']>[0]);

        assert.strictEqual(received.length, 1);
        const payload = expectPayload(received);
        assert.partialDeepStrictEqual(payload, {
            packageName: 'pkg-build',
            stage: 'build'
        });
        assert.ok(typeof payload.durationMs === 'number' && payload.durationMs >= 0);
    });

    test('withStageTimings emits a non-negative durationMs that reflects elapsed time, not wall-clock', async function () {
        const broadcaster = createProgressBroadcaster();
        const received: number[] = [];
        broadcaster.consumer.on('stageTimed', function (payload) {
            received.push(payload.durationMs);
        });

        const wrapped = withStageTimings(createPlainProcessor(), broadcaster.provider);
        await wrapped.resolveAndLink({ name: 'pkg-a' } as unknown as Parameters<PackageProcessor['resolveAndLink']>[0]);

        const [ durationMs ] = received;
        if (durationMs === undefined) {
            assert.fail('expected durationMs');
        }
        assert.ok(durationMs >= 0, 'durationMs must be non-negative');
        assert.ok(durationMs < 10_000, 'durationMs must reflect elapsed time, not wall clock or a sum');
    });
}

function registerFailureCaptureTests(): void {
    test('withFailureCapture forwards the wrapped success value when execute resolves', async function () {
        const broadcaster = createProgressBroadcaster();
        const sentinel = { ok: true };

        const wrapped = withFailureCapture(
            broadcaster.provider,
            'publish',
            async function (input: FailureInput) {
                assert.strictEqual(input.name, 'pkg-a');
                return sentinel;
            }
        );

        const result = await wrapped({ name: 'pkg-a' });

        assert.strictEqual(result, sentinel);
    });

    test('withFailureCapture emits packageFailed with the error message when execute throws an Error', async function () {
        const broadcaster = createProgressBroadcaster();
        const received: PackageFailedPayload[] = [];
        broadcaster.consumer.on('packageFailed', function (payload) {
            received.push({ packageName: payload.packageName, stage: payload.stage, message: payload.message });
        });

        const wrapped = withFailureCapture(
            broadcaster.provider,
            'publish',
            async function (input: FailureInput) {
                assert.strictEqual(input.name, 'pkg-a');
                throw new Error('kaboom');
            }
        );

        try {
            await wrapped({ name: 'pkg-a' });
            assert.fail('expected wrapped() to throw');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'kaboom');
        }
        assert.deepStrictEqual(received, [ { packageName: 'pkg-a', stage: 'publish', message: 'kaboom' } ]);
    });

    test('withFailureCapture coerces a non-Error throwable into a string message', async function () {
        const broadcaster = createProgressBroadcaster();
        const received: string[] = [];
        broadcaster.consumer.on('packageFailed', function (payload) {
            received.push(payload.message);
        });

        const wrapped = withFailureCapture(
            broadcaster.provider,
            'publish',
            async function (input: FailureInput) {
                assert.strictEqual(input.name, 'pkg-a');
                const stringThrowable: unknown = 'plain string';

                throw stringThrowable;
            }
        );

        try {
            await wrapped({ name: 'pkg-a' });
            assert.fail('expected wrapped() to throw');
        } catch (error: unknown) {
            assert.strictEqual(error, 'plain string');
        }
        assert.deepStrictEqual(received, [ 'plain string' ]);
    });

    test('withFailureCapture re-throws the original error', async function () {
        const broadcaster = createProgressBroadcaster();
        broadcaster.consumer.on('packageFailed', function () {
            return undefined;
        });
        const original = new Error('orig');

        const wrapped = withFailureCapture(
            broadcaster.provider,
            'publish',
            async function (input: FailureInput) {
                assert.strictEqual(input.name, 'pkg-a');
                throw original;
            }
        );

        try {
            await wrapped({ name: 'pkg-a' });
            assert.fail('expected wrapped() to throw');
        } catch (error: unknown) {
            assert.strictEqual(error, original);
        }
    });

    test('withFailureCapture skips the emit when no subscriber is registered for packageFailed', async function () {
        const wrappedBroadcaster = createSpyingBroadcaster();

        const wrapped = withFailureCapture(
            wrappedBroadcaster.provider,
            'publish',
            async function (input: FailureInput) {
                assert.strictEqual(input.name, 'pkg-a');
                throw new Error('boom');
            }
        );

        try {
            await wrapped({ name: 'pkg-a' });
            assert.fail('expected wrapped() to throw');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'boom');
        }
        assert.strictEqual(wrappedBroadcaster.emitSpy.callCount, 0);
    });

    test('withFailureCapture does NOT emit when execute resolves successfully', async function () {
        const broadcaster = createProgressBroadcaster();
        const received: unknown[] = [];
        broadcaster.consumer.on('packageFailed', function (payload) {
            received.push(payload);
        });

        const wrapped = withFailureCapture(
            broadcaster.provider,
            'publish',
            async function (input: FailureInput) {
                assert.strictEqual(input.name, 'pkg-a');
                return undefined;
            }
        );

        await wrapped({ name: 'pkg-a' });

        assert.deepStrictEqual(received, []);
    });
}

suite('decorators', function () {
    registerStageTimingTests();
    registerFailureCaptureTests();
});
