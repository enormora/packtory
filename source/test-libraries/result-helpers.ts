import assert from 'node:assert';
import type { Result } from 'true-myth';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../progress/progress-broadcaster.ts';

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
        getReport: () => undefined
    };
}

export const createTestProgressBroadcaster: () => ProgressBroadcaster = createProgressBroadcaster;
