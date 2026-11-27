import { clearTimeout as clearDeadlineTimeout, setTimeout as setDeadlineTimeout } from 'node:timers';

type Deadline = {
    readonly fail: (error: Error) => void;
    readonly promise: Promise<never>;
};

function ignoreDeadlineFailure(): void {
    return undefined;
}

function createDeadline(): Deadline {
    let failDeadline = ignoreDeadlineFailure;
    const promise = new Promise<never>(function (_resolve, reject) {
        failDeadline = reject;
    });

    return { fail: failDeadline, promise };
}

export async function withDeadline<T>(operation: Promise<T>, label: string, timeoutMilliseconds: number): Promise<T> {
    const deadline = createDeadline();
    const timeout = setDeadlineTimeout(function () {
        deadline.fail(new Error(`${label} timed out`));
    }, timeoutMilliseconds);

    try {
        return await Promise.race([
            operation,
            deadline.promise
        ]);
    } finally {
        clearDeadlineTimeout(timeout);
    }
}
