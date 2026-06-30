import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { bootSpinnerRuntime } from './spinner-boot.ts';
import type { WorkerSpawnRequest } from './spinner-runtime.ts';

function noop(): void {
    return undefined;
}

suite('spinner-boot', function () {
    test('bootSpinnerRuntime spawns the worker via the supplied spawn function', function () {
        const spawnWorker = fake();

        bootSpinnerRuntime({
            spawnWorker(request) {
                spawnWorker(request);
            },
            stdoutFileDescriptor: 1,
            stdoutColumns: 80,
            initialLabel: 'lbl',
            initialMessage: 'msg'
        });

        assert.strictEqual(spawnWorker.callCount, 1);
        const request = spawnWorker.firstCall.firstArg as WorkerSpawnRequest;
        assert.ok(request.buffer instanceof SharedArrayBuffer);
        assert.strictEqual(typeof request.slotCount, 'number');
    });

    test('bootSpinnerRuntime writes the initial label and message to slot zero', function () {
        const runtime = bootSpinnerRuntime({
            spawnWorker: noop,
            stdoutFileDescriptor: 1,
            stdoutColumns: 80,
            initialLabel: 'packtory',
            initialMessage: 'Starting …'
        });

        assert.deepStrictEqual(runtime.accessors.readSlot(0), {
            state: 'running',
            label: 'packtory',
            message: 'Starting …'
        });
    });

    test('bootSpinnerRuntime leaves all other slots empty', function () {
        const runtime = bootSpinnerRuntime({
            slotCount: 4,
            spawnWorker: noop,
            stdoutFileDescriptor: 1,
            stdoutColumns: 80,
            initialLabel: 'lbl',
            initialMessage: 'msg'
        });

        for (const slotIndex of [ 1, 2, 3 ]) {
            assert.deepStrictEqual(runtime.accessors.readSlot(slotIndex), {
                state: 'empty',
                label: '',
                message: ''
            });
        }
    });

    test('bootSpinnerRuntime forwards runtime options like intervalMs and stdoutColumns', function () {
        const runtime = bootSpinnerRuntime({
            intervalMs: 25,
            stdoutFileDescriptor: 1,
            stdoutColumns: 132,
            spawnWorker: noop,
            initialLabel: 'lbl',
            initialMessage: 'msg'
        });

        assert.strictEqual(runtime.accessors.getIntervalMs(), 25);
        assert.strictEqual(runtime.accessors.getColumns(), 132);
    });
});
