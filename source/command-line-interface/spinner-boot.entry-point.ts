import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker as WorkerThread } from 'node:worker_threads';
import { bootSpinnerRuntime } from './spinner-boot.ts';
import type { SpinnerRuntime, WorkerSpawnRequest } from './spinner-worker-backend.ts';

const workerModulePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'spinner-worker.entry-point.ts');

function spawnWorker(request: WorkerSpawnRequest): void {
    const worker = new WorkerThread(workerModulePath, {
        workerData: {
            buffer: request.buffer,
            slotCount: request.slotCount,
            stdoutFileDescriptor: request.stdoutFileDescriptor
        },
        execArgv: ['--experimental-strip-types', '--enable-source-maps']
    });
    worker.unref();
}

export const bootedSpinnerRuntime: SpinnerRuntime = bootSpinnerRuntime({
    spawnWorker,
    initialLabel: 'packtory',
    initialMessage: 'Starting …'
});
