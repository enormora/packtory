import { setTimeout as delay } from 'node:timers/promises';

export async function withDeadline<T>(operation: Promise<T>, label: string, timeoutMilliseconds: number): Promise<T> {
    return await Promise.race([
        operation,
        delay(timeoutMilliseconds).then(() => {
            throw new Error(`${label} timed out`);
        })
    ]);
}
