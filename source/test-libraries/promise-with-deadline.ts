import { clearTimeout as clearTimer, setTimeout as setTimer } from 'node:timers';

const defaultDeadlineMs = 50;

export async function withPromiseDeadline<T>(
    promise: Promise<T>,
    description: string,
    deadlineMs = defaultDeadlineMs
): Promise<T> {
    const timeout = { id: undefined as ReturnType<typeof setTimer> | undefined };

    try {
        return await Promise.race([
            promise,
            new Promise<never>(function (_resolve, reject) {
                timeout.id = setTimer(function () {
                    reject(new Error(`Timed out waiting for ${description}`));
                }, deadlineMs);
            })
        ]);
    } finally {
        if (timeout.id !== undefined) {
            clearTimer(timeout.id);
        }
    }
}
