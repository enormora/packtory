import assert from 'node:assert';
import { test } from 'mocha';
import { fake } from 'sinon';
import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';
import {
    createSpinnerRuntime,
    createWorkerSpinnerBackend,
    type SpinnerRuntime,
    type WorkerSpawnRequest
} from './spinner-worker-backend.ts';

function buildRuntime(slotCount = 4): { runtime: SpinnerRuntime; accessors: SpinnerSharedAccessors } {
    const layout = createSpinnerSharedLayout(slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    const accessors = createSpinnerSharedAccessors(buffer, layout);
    return { runtime: { accessors, slotCount }, accessors };
}

test('createSpinnerRuntime sets the shared buffer up with the resolved interval and column count', () => {
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

test('createSpinnerRuntime hands the spawn helper the buffer, slot count and stdout file descriptor', () => {
    const spawnWorker = fake();

    const runtime = createSpinnerRuntime({
        slotCount: 2,
        stdoutFileDescriptor: 5,
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

test('createSpinnerRuntime falls back to defaults when no options are provided', () => {
    const spawnWorker = fake();

    const runtime = createSpinnerRuntime({
        spawnWorker: (request) => {
            spawnWorker(request);
        }
    });

    assert.strictEqual(runtime.slotCount, 64);
    assert.strictEqual(runtime.accessors.getIntervalMs(), 80);
    assert.ok(runtime.accessors.getColumns() > 0);
});

test('createWorkerSpinnerBackend.add stores a running slot in the supplied runtime', () => {
    const { runtime, accessors } = buildRuntime();
    const backend = createWorkerSpinnerBackend({ runtime });

    backend.add(2, 'pkg', 'starting');

    assert.deepStrictEqual(accessors.readSlot(2), { state: 'running', label: 'pkg', message: 'starting' });
});

test('createWorkerSpinnerBackend.update writes a new running slot value', () => {
    const { runtime, accessors } = buildRuntime();
    const backend = createWorkerSpinnerBackend({ runtime });

    backend.add(0, 'pkg', 'one');
    backend.update(0, 'pkg', 'two');

    assert.deepStrictEqual(accessors.readSlot(0), { state: 'running', label: 'pkg', message: 'two' });
});

test('createWorkerSpinnerBackend.finish records the finished status', () => {
    const { runtime, accessors } = buildRuntime();
    const backend = createWorkerSpinnerBackend({ runtime });

    backend.finish(1, 'succeeded', 'pkg', 'done');

    assert.deepStrictEqual(accessors.readSlot(1), { state: 'succeeded', label: 'pkg', message: 'done' });
});

test('createWorkerSpinnerBackend.add throws when the slot index is at or beyond the runtime capacity', () => {
    const { runtime } = buildRuntime(2);
    const backend = createWorkerSpinnerBackend({ runtime });

    assert.throws(() => {
        backend.add(2, 'pkg', 'msg');
    }, /Spinner slot index 2 exceeds backend capacity 2; increase slotCount/u);
});

test('createWorkerSpinnerBackend.update throws when the slot index is beyond the runtime capacity', () => {
    const { runtime } = buildRuntime(1);
    const backend = createWorkerSpinnerBackend({ runtime });

    assert.throws(() => {
        backend.update(5, 'pkg', 'msg');
    }, /exceeds backend capacity 1/u);
});

test('createWorkerSpinnerBackend.finish throws when the slot index is beyond the runtime capacity', () => {
    const { runtime } = buildRuntime(1);
    const backend = createWorkerSpinnerBackend({ runtime });

    assert.throws(() => {
        backend.finish(5, 'failed', 'pkg', 'msg');
    }, /exceeds backend capacity 1/u);
});

test('createWorkerSpinnerBackend.shutdown forwards the shutdown signal to the supplied runtime', () => {
    const { runtime, accessors } = buildRuntime();
    const backend = createWorkerSpinnerBackend({ runtime });

    backend.shutdown();

    assert.strictEqual(accessors.isShutdownRequested(), true);
});
