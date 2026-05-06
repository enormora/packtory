import assert from 'node:assert';
import type { Result } from 'true-myth';

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
