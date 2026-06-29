import type { Clock } from '../common/clock.ts';

type FakeClockOptions = {
    readonly initialTimestamp?: number;
};

type HandlerInfo = {
    readonly executionTimestamp: number;
    readonly handler: () => void;
};

export type FakeClock = Clock & {
    readonly tick: (delayInMilliseconds: number) => void;
};

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

export function createFakeClock(options: FakeClockOptions = {}): FakeClock {
    const { initialTimestamp = 0 } = options;

    let currentTimestamp = initialTimestamp;
    let currentHandlerIndex = -1;
    const handlers = new Map<number, HandlerInfo>();

    function runScheduledHandlers(): void {
        Array.from(handlers).forEach(function ([ id, handlerInfo ]) {
            if (currentTimestamp >= handlerInfo.executionTimestamp) {
                handlers.delete(id);
                handlerInfo.handler();
            }
        });
    }

    return {
        getCurrentTimeInMilliseconds() {
            return currentTimestamp;
        },

        setTimeout<Arguments extends readonly unknown[]>(
            handler: (...args: Arguments) => void,
            delayInMilliseconds: number,
            ...args: Arguments
        ) {
            if (delayInMilliseconds < 0) {
                throw new Error(`Invalid delay ${delayInMilliseconds}, must be greater than or equal to 0`);
            }

            if (!Number.isFinite(delayInMilliseconds)) {
                throw new TypeError('Invalid delay, must be a finite number');
            }

            currentHandlerIndex += 1;
            const executionTimestamp = currentTimestamp + delayInMilliseconds;
            handlers.set(currentHandlerIndex, {
                executionTimestamp,
                handler() {
                    handler(...args);
                }
            });

            runScheduledHandlers();
            return currentHandlerIndex as unknown as TimerHandle;
        },

        clearTimeout(id) {
            handlers.delete(Number(id));
        },

        tick(delayInMilliseconds) {
            currentTimestamp += delayInMilliseconds;
            runScheduledHandlers();
        }
    };
}
