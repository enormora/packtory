/* eslint-disable @typescript-eslint/no-unnecessary-condition -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { test } from 'mocha';
import { createSpinnerRuntime, type WorkerSpawnRequest } from './spinner-runtime.ts';

function captureSpawn(): {
    readonly spawn: (request: WorkerSpawnRequest) => void;
    readonly calls: WorkerSpawnRequest[];
} {
    const calls: WorkerSpawnRequest[] = [];
    return {
        calls,
        spawn: (request) => {
            calls.push(request);
        }
    };
}

test('createSpinnerRuntime applies the configured slot count and stores it on the runtime', () => {
    const { spawn } = captureSpawn();
    const runtime = createSpinnerRuntime({
        slotCount: 5,
        stdoutFileDescriptor: 1,
        stdoutColumns: 80,
        spawnWorker: spawn
    });

    assert.strictEqual(runtime.slotCount, 5);
    assert.strictEqual(runtime.accessors.layout.slotCount, 5);
});

test('createSpinnerRuntime defaults the slot count when none is provided', () => {
    const { spawn } = captureSpawn();
    const runtime = createSpinnerRuntime({ stdoutFileDescriptor: 1, stdoutColumns: 80, spawnWorker: spawn });

    assert.strictEqual(runtime.slotCount, 64);
});

test('createSpinnerRuntime spawns the worker with the buffer, slot count and stdout fd', () => {
    const { spawn, calls } = captureSpawn();
    const runtime = createSpinnerRuntime({
        slotCount: 4,
        stdoutFileDescriptor: 7,
        stdoutColumns: 80,
        spawnWorker: spawn
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0]?.buffer, runtime.accessors.buffer);
    assert.strictEqual(calls[0]?.slotCount, 4);
    assert.strictEqual(calls[0]?.stdoutFileDescriptor, 7);
});

test('createSpinnerRuntime initializes the shared accessors with the requested interval and columns', () => {
    const { spawn } = captureSpawn();
    const runtime = createSpinnerRuntime({
        intervalMs: 120,
        stdoutFileDescriptor: 1,
        stdoutColumns: 100,
        spawnWorker: spawn
    });

    assert.strictEqual(runtime.accessors.getIntervalMs(), 120);
    assert.strictEqual(runtime.accessors.getColumns(), 100);
});

test('createSpinnerRuntime defaults the interval to 80ms when none is provided', () => {
    const { spawn } = captureSpawn();
    const runtime = createSpinnerRuntime({ stdoutFileDescriptor: 1, stdoutColumns: 80, spawnWorker: spawn });

    assert.strictEqual(runtime.accessors.getIntervalMs(), 80);
});
