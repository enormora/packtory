import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker as WorkerThread } from 'node:worker_threads';
import { bootSpinnerRuntime } from '../../command-line-interface/spinner/spinner-boot.ts';
import type { SpinnerRuntime, WorkerSpawnRequest } from '../../command-line-interface/spinner/spinner-runtime.ts';

const bootModulePath = fileURLToPath(import.meta.url);
const bootModuleExtension = path.extname(bootModulePath);
const workerModulePath = path.join(path.dirname(bootModulePath), `spinner-worker.entry-point${bootModuleExtension}`);
const defaultStdoutColumns = 80;
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
    worker.on('error', (error: Error) => {
        process.stderr.write(`spinner worker error: ${error.message}\n`);
    });
}

export function createBootedSpinnerRuntime(): SpinnerRuntime {
    return bootSpinnerRuntime({
        spawnWorker,
        stdoutFileDescriptor: process.stdout.fd,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- process.stdout.columns is undefined at runtime when stdout is not a TTY, despite the type declaring it as number
        stdoutColumns: process.stdout.columns ?? defaultStdoutColumns,
        initialLabel: 'packtory',
        initialMessage: 'Starting …'
    });
}
