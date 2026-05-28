import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';
import { createSpinnerRuntime, type SpinnerRuntime, type WorkerSpawnRequest } from './spinner-runtime.ts';
import { createWorkerSpinnerBackend } from './spinner-worker-backend.ts';

function buildRuntime(slotCount = 4): { runtime: SpinnerRuntime; accessors: SpinnerSharedAccessors } {
    const layout = createSpinnerSharedLayout(slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    const accessors = createSpinnerSharedAccessors(buffer, layout);
    return { runtime: { accessors, slotCount }, accessors };
}

function buildRuntimeWithFakeAccessors(overrides: Partial<SpinnerSharedAccessors> = {}): {
    runtime: SpinnerRuntime;
    accessors: SpinnerSharedAccessors;
} {
    const accessors = {
        ...createSpinnerSharedAccessors(
            new SharedArrayBuffer(createSpinnerSharedLayout(4).bufferByteLength),
            createSpinnerSharedLayout(4)
        ),
        ...overrides
    };
    return { runtime: { accessors, slotCount: 4 }, accessors };
}

function collectShutdownWaitCalls(intervalMs = 0): readonly (readonly [number, number])[] {
    const waitForRenderedMutationCalls: (readonly [number, number])[] = [];
    const { runtime } = buildRuntimeWithFakeAccessors({
        getIntervalMs: () => {
            return intervalMs;
        },
        waitForRenderedMutation: (mutation, timeoutMs) => {
            waitForRenderedMutationCalls.push([mutation, timeoutMs]);
            return true;
        }
    });
    const backend = createWorkerSpinnerBackend({ runtime });

    backend.shutdown();

    return waitForRenderedMutationCalls;
}

suite('spinner-worker-backend', function () {
    test('createSpinnerRuntime sets the shared buffer up with the resolved interval and column count', function () {
        const spawnWorker = fake();

        const runtime = createSpinnerRuntime({
            slotCount: 8,
            intervalMs: 25,
            stdoutFileDescriptor: 7,
            stdoutColumns: 132,
            spawnWorker: (request) => {
                spawnWorker(request);
            }
        });

        assert.strictEqual(runtime.slotCount, 8);
        assert.strictEqual(runtime.accessors.getIntervalMs(), 25);
        assert.strictEqual(runtime.accessors.getColumns(), 132);
    });

    test('createSpinnerRuntime hands the spawn helper the buffer, slot count and stdout file descriptor', function () {
        const spawnWorker = fake();

        const runtime = createSpinnerRuntime({
            slotCount: 2,
            stdoutFileDescriptor: 5,
            stdoutColumns: 120,
            spawnWorker: (request) => {
                spawnWorker(request);
            }
        });

        assert.strictEqual(spawnWorker.callCount, 1);
        const request = spawnWorker.firstCall.firstArg as WorkerSpawnRequest;
        assert.strictEqual(request.buffer, runtime.accessors.buffer);
        assert.strictEqual(request.slotCount, 2);
        assert.strictEqual(request.stdoutFileDescriptor, 5);
    });

    test('createSpinnerRuntime falls back to default slot and interval settings', function () {
        const spawnWorker = fake();

        const runtime = createSpinnerRuntime({
            stdoutFileDescriptor: 1,
            stdoutColumns: 80,
            spawnWorker: (request) => {
                spawnWorker(request);
            }
        });

        assert.strictEqual(runtime.slotCount, 64);
        assert.strictEqual(runtime.accessors.getIntervalMs(), 80);
        assert.strictEqual(runtime.accessors.getColumns(), 80);
    });

    test('createWorkerSpinnerBackend.add stores a running slot in the supplied runtime', function () {
        const { runtime, accessors } = buildRuntime();
        const backend = createWorkerSpinnerBackend({ runtime });

        backend.add(2, 'pkg', 'starting');

        assert.deepStrictEqual(accessors.readSlot(2), { state: 'running', label: 'pkg', message: 'starting' });
        assert.strictEqual(accessors.getLatestMutation(), 1);
    });

    test('createWorkerSpinnerBackend.update writes a new running slot value', function () {
        const { runtime, accessors } = buildRuntime();
        const backend = createWorkerSpinnerBackend({ runtime });

        backend.add(0, 'pkg', 'one');
        backend.update(0, 'pkg', 'two');

        assert.deepStrictEqual(accessors.readSlot(0), { state: 'running', label: 'pkg', message: 'two' });
        assert.strictEqual(accessors.getLatestMutation(), 2);
    });

    test('createWorkerSpinnerBackend.finish records the finished status', function () {
        const { runtime, accessors } = buildRuntime();
        const backend = createWorkerSpinnerBackend({ runtime });

        backend.finish(1, 'succeeded', 'pkg', 'done');

        assert.deepStrictEqual(accessors.readSlot(1), { state: 'succeeded', label: 'pkg', message: 'done' });
        assert.strictEqual(accessors.getLatestMutation(), 1);
    });

    test('createWorkerSpinnerBackend.add throws when the slot index is at or beyond the runtime capacity', function () {
        const { runtime } = buildRuntime(2);
        const backend = createWorkerSpinnerBackend({ runtime });

        assert.throws(() => {
            backend.add(2, 'pkg', 'msg');
        }, /Spinner slot index 2 exceeds backend capacity 2; increase slotCount/u);
    });

    test('createWorkerSpinnerBackend.update throws when the slot index is beyond the runtime capacity', function () {
        const { runtime } = buildRuntime(1);
        const backend = createWorkerSpinnerBackend({ runtime });

        assert.throws(() => {
            backend.update(5, 'pkg', 'msg');
        }, /exceeds backend capacity 1/u);
    });

    test('createWorkerSpinnerBackend.finish throws when the slot index is beyond the runtime capacity', function () {
        const { runtime } = buildRuntime(1);
        const backend = createWorkerSpinnerBackend({ runtime });

        assert.throws(() => {
            backend.finish(5, 'failed', 'pkg', 'msg');
        }, /exceeds backend capacity 1/u);
    });

    test('createWorkerSpinnerBackend.shutdown forwards the shutdown signal to the supplied runtime', function () {
        const { runtime, accessors } = buildRuntime();
        const backend = createWorkerSpinnerBackend({ runtime });

        backend.shutdown();

        assert.strictEqual(accessors.isShutdownRequested(), true);
        assert.strictEqual(accessors.getLatestMutation(), 1);
    });

    test('createWorkerSpinnerBackend.shutdown waits for the render acknowledgement when the worker interval is positive', function () {
        assert.deepStrictEqual(collectShutdownWaitCalls(25), [[1, 100]]);
    });

    test('createWorkerSpinnerBackend.shutdown uses the interval-derived timeout when it exceeds the minimum', function () {
        assert.deepStrictEqual(collectShutdownWaitCalls(80), [[1, 320]]);
    });

    test('createWorkerSpinnerBackend.shutdown skips waiting when the worker interval is zero', function () {
        assert.deepStrictEqual(collectShutdownWaitCalls(), []);
    });

    test('createWorkerSpinnerBackend.shutdown is idempotent when invoked multiple times', function () {
        const waitForRenderedMutationCalls: (readonly [number, number])[] = [];
        const { runtime, accessors } = buildRuntimeWithFakeAccessors({
            getIntervalMs: () => {
                return 80;
            },
            waitForRenderedMutation: (mutation, timeoutMs) => {
                waitForRenderedMutationCalls.push([mutation, timeoutMs]);
                return true;
            }
        });
        const backend = createWorkerSpinnerBackend({ runtime });

        backend.shutdown();
        backend.shutdown();

        assert.strictEqual(accessors.isShutdownRequested(), true);
        assert.strictEqual(accessors.getLatestMutation(), 1);
        assert.deepStrictEqual(waitForRenderedMutationCalls, [[1, 320]]);
    });
});
