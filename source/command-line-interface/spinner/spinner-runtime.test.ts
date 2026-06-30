import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createSpinnerRuntime, type WorkerSpawnRequest } from './spinner-runtime.ts';

type CapturedSpawn = {
    readonly spawn: (request: WorkerSpawnRequest) => void;
    readonly calls: readonly WorkerSpawnRequest[];
};

function captureSpawn(): CapturedSpawn {
    const calls: WorkerSpawnRequest[] = [];
    return {
        calls,
        spawn(request) {
            calls.push(request);
        }
    };
}

suite('spinner-runtime', function () {
    test('createSpinnerRuntime applies the configured slot count and stores it on the runtime', function () {
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

    test('createSpinnerRuntime defaults the slot count when none is provided', function () {
        const { spawn } = captureSpawn();
        const runtime = createSpinnerRuntime({ stdoutFileDescriptor: 1, stdoutColumns: 80, spawnWorker: spawn });

        assert.strictEqual(runtime.slotCount, 64);
    });

    test('createSpinnerRuntime spawns the worker with the buffer, slot count and stdout fd', function () {
        const { spawn, calls } = captureSpawn();
        const runtime = createSpinnerRuntime({
            slotCount: 4,
            stdoutFileDescriptor: 7,
            stdoutColumns: 80,
            spawnWorker: spawn
        });

        assert.strictEqual(calls.length, 1);
        const request = calls[0];
        if (request === undefined) {
            assert.fail('expected a worker spawn request');
        }
        assert.strictEqual(request.buffer, runtime.accessors.buffer);
        assert.strictEqual(request.slotCount, 4);
        assert.strictEqual(request.stdoutFileDescriptor, 7);
    });

    test('createSpinnerRuntime initializes the shared accessors with the requested interval and columns', function () {
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

    test('createSpinnerRuntime defaults the interval to 80ms when none is provided', function () {
        const { spawn } = captureSpawn();
        const runtime = createSpinnerRuntime({ stdoutFileDescriptor: 1, stdoutColumns: 80, spawnWorker: spawn });

        assert.strictEqual(runtime.accessors.getIntervalMs(), 80);
    });
});
