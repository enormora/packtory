import assert from 'node:assert';
import { test } from 'mocha';
import { fake } from 'sinon';
import { bootSpinnerRuntime } from './spinner-boot.ts';
import type { WorkerSpawnRequest } from './spinner-worker-backend.ts';

test('bootSpinnerRuntime spawns the worker via the supplied spawn function', () => {
    const spawnWorker = fake();

    bootSpinnerRuntime({
        spawnWorker: (request) => {
            spawnWorker(request);
        },
        initialLabel: 'lbl',
        initialMessage: 'msg'
    });

    assert.strictEqual(spawnWorker.callCount, 1);
    const request = spawnWorker.firstCall.firstArg as WorkerSpawnRequest;
    assert.ok(request.buffer instanceof SharedArrayBuffer);
    assert.strictEqual(typeof request.slotCount, 'number');
});

test('bootSpinnerRuntime writes the initial label and message to slot zero', () => {
    const runtime = bootSpinnerRuntime({
        spawnWorker: () => {
            // noop
        },
        initialLabel: 'packtory',
        initialMessage: 'Starting …'
    });

    assert.deepStrictEqual(runtime.accessors.readSlot(0), {
        state: 'running',
        label: 'packtory',
        message: 'Starting …'
    });
});

test('bootSpinnerRuntime bumps the generation of slot zero so workers pick the boot up immediately', () => {
    const runtime = bootSpinnerRuntime({
        spawnWorker: () => {
            // noop
        },
        initialLabel: 'lbl',
        initialMessage: 'msg'
    });

    assert.strictEqual(runtime.accessors.readSlotGeneration(0), 1);
});

test('bootSpinnerRuntime leaves all other slots empty and at generation zero', () => {
    const runtime = bootSpinnerRuntime({
        slotCount: 4,
        spawnWorker: () => {
            // noop
        },
        initialLabel: 'lbl',
        initialMessage: 'msg'
    });

    for (const slotIndex of [1, 2, 3]) {
        assert.deepStrictEqual(runtime.accessors.readSlot(slotIndex), {
            state: 'empty',
            label: '',
            message: ''
        });
        assert.strictEqual(runtime.accessors.readSlotGeneration(slotIndex), 0);
    }
});

test('bootSpinnerRuntime forwards runtime options like intervalMs and stdoutColumns', () => {
    const runtime = bootSpinnerRuntime({
        intervalMs: 25,
        stdoutColumns: 132,
        spawnWorker: () => {
            // noop
        },
        initialLabel: 'lbl',
        initialMessage: 'msg'
    });

    assert.strictEqual(runtime.accessors.getIntervalMs(), 25);
    assert.strictEqual(runtime.accessors.getColumns(), 132);
});
