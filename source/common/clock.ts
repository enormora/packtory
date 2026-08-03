import { clearTimeout as clearTimer, setTimeout as setTimer } from 'node:timers';

export type Clock = {
    readonly getCurrentTimeInMilliseconds: () => number;
    readonly setTimeout: <Arguments extends readonly unknown[]>(
        handler: (...timerArguments: Arguments) => void,
        delayInMilliseconds: number,
        ...timerArguments: Arguments
    ) => ReturnType<typeof globalThis.setTimeout>;
    readonly clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => void;
};

export function createClock(): Clock {
    return {
        getCurrentTimeInMilliseconds() {
            return Date.now();
        },

        setTimeout: setTimer,

        clearTimeout: clearTimer
    };
}
