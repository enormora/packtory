import { writeSync } from 'node:fs';
import { setInterval as scheduleInterval, clearInterval as cancelInterval } from 'node:timers';
import { workerData } from 'node:worker_threads';
import { isSpinnerWorkerInput, startSpinnerWorker } from './spinner-worker-loop.ts';

if (!isSpinnerWorkerInput(workerData)) {
    throw new TypeError('Spinner worker started with invalid workerData');
}

startSpinnerWorker(workerData, {
    write: (fileDescriptor, chunk) => {
        // eslint-disable-next-line node/no-sync -- the worker holds the only writer to fd 1 and synchronous writes are the simplest way to render
        writeSync(fileDescriptor, chunk);
    },
    setInterval: scheduleInterval,
    clearInterval: cancelInterval
});
