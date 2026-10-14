import { clearTimeout as clearTimer, setTimeout as setTimer } from 'node:timers';

const defaultDeadlineMilliseconds = 50;

export async function withPromiseDeadline<T>(
    promise: Promise<T>,
    description: string,
    deadlineMilliseconds = defaultDeadlineMilliseconds
): Promise<T> {
    const timeout = { identifier: undefined as ReturnType<typeof setTimer> | undefined };

    try {
        return await Promise.race([
            promise,
            new Promise<never>(function (_resolve, reject) {
                timeout.identifier = setTimer(function () {
                    reject(new Error(`Timed out waiting for ${description}`));
                }, deadlineMilliseconds);
            })
        ]);
    } finally {
        if (timeout.identifier !== undefined) {
            clearTimer(timeout.identifier);
        }
    }
}
