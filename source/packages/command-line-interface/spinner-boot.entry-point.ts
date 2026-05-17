import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker as WorkerThread } from 'node:worker_threads';
import { bootSpinnerRuntime } from '../../command-line-interface/spinner-boot.ts';
import type { SpinnerRuntime, WorkerSpawnRequest } from '../../command-line-interface/spinner-worker-backend.ts';

const bootModulePath = fileURLToPath(import.meta.url);
const bootModuleExtension = path.extname(bootModulePath);
const workerModulePath = path.join(path.dirname(bootModulePath), `spinner-worker.entry-point${bootModuleExtension}`);
const workerExecArgv =
    bootModuleExtension === '.ts' ? ['--experimental-strip-types', '--enable-source-maps'] : ['--enable-source-maps'];

function spawnWorker(request: WorkerSpawnRequest): void {
    const worker = new WorkerThread(workerModulePath, {
        workerData: {
            buffer: request.buffer,
            slotCount: request.slotCount,
            stdoutFileDescriptor: request.stdoutFileDescriptor
        },
        execArgv: workerExecArgv
    });
    worker.unref();
}

export const bootedSpinnerRuntime: SpinnerRuntime = bootSpinnerRuntime({
    spawnWorker,
    stdoutFileDescriptor: process.stdout.fd,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- process.stdout.columns is undefined at runtime when stdout is not a TTY, despite the type declaring it as number
    stdoutColumns: process.stdout.columns ?? 80,
    initialLabel: 'packtory',
    initialMessage: 'Starting …'
});
