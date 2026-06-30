import { setTimeout as delay } from 'node:timers/promises';

async function timeoutFailure(label: string, timeoutMilliseconds: number): Promise<never> {
    await delay(timeoutMilliseconds);
    throw new Error(`${label} timed out`);
}

export async function withDeadline<T>(operation: Promise<T>, label: string, timeoutMilliseconds: number): Promise<T> {
    return await Promise.race([
        operation,
        timeoutFailure(label, timeoutMilliseconds)
    ]);
}
