import assert from 'node:assert';
import { fake, type SinonSpy } from 'sinon';
import type { Result } from 'true-myth';
import {
    createProgressBroadcaster,
    type ProgressBroadcaster,
    type ProgressBroadcastProvider
} from '../progress/progress-broadcaster.ts';

export function getErrResult<TValue, TError>(result: Result<TValue, TError>, message: string): TError {
    if (result.isErr) {
        return result.error;
    }

    assert.fail(message);
    throw new Error(message);
}

export function getOkResult<TValue, TError>(result: Result<TValue, TError>, message: string): TValue {
    if (result.isOk) {
        return result.value;
    }

    assert.fail(message);
    throw new Error(message);
}

export function toOutcome<TResult>(result: TResult): { readonly result: TResult; readonly getReport: () => undefined } {
    return {
        result,
        getReport: () => {
            return undefined;
        }
    };
}

export const createTestProgressBroadcaster: () => ProgressBroadcaster = createProgressBroadcaster;

export type SpyingBroadcaster = {
    readonly provider: ProgressBroadcastProvider;
    readonly consumer: ReturnType<typeof createProgressBroadcaster>['consumer'];
    readonly emitSpy: SinonSpy;
};

export function createSpyingBroadcaster(): SpyingBroadcaster {
    const broadcaster = createProgressBroadcaster();
    const emitSpy = fake();
    const provider: ProgressBroadcastProvider = {
        emit: (eventName, payload): void => {
            emitSpy(eventName, payload);
            broadcaster.provider.emit(eventName, payload);
        },
        hasSubscribers: broadcaster.provider.hasSubscribers
    };
    return { provider, consumer: broadcaster.consumer, emitSpy };
}
