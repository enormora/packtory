import { writeSync as writeSynchronous } from 'node:fs';
import { setInterval as scheduleInterval, clearInterval as cancelInterval } from 'node:timers';
import { workerData } from 'node:worker_threads';
import { isSpinnerWorkerInput, startSpinnerWorker } from '../../command-line-interface/spinner/spinner-worker-loop.ts';

if (!isSpinnerWorkerInput(workerData)) {
    throw new TypeError('Spinner worker started with invalid workerData');
}

startSpinnerWorker(workerData, {
    write(fileDescriptor, chunk) {
        writeSynchronous(fileDescriptor, chunk);
    },
    setInterval: scheduleInterval,
    clearInterval: cancelInterval
});
