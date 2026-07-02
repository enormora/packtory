import type { Result } from 'true-myth';
import { partialFailureType, type PartialErrorResult } from './packtory-results.ts';
import type { PartialError } from './scheduler.ts';

type PartialFailure<T> = PartialError<T> & { readonly type: typeof partialFailureType; };
type PartialSuccessLike<T> = { readonly succeeded: readonly T[]; readonly failures: readonly Error[]; };

function isPartialSuccessLike<T>(value: unknown): value is PartialSuccessLike<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        Object.hasOwn(value, 'succeeded') &&
        Object.hasOwn(value, 'failures')
    );
}

export function succeededResultsFrom<T, TFailure>(result: Result<readonly T[], TFailure>): readonly T[] {
    if (result.isOk) {
        return result.value;
    }

    return isPartialSuccessLike<T>(result.error) ? result.error.succeeded : [];
}

export function isSuccessOrPartialSuccess<T, TFailure>(result: Result<readonly T[], TFailure>): boolean {
    return result.isOk || succeededResultsFrom(result).length > 0;
}

export function partialFailureMessages<T>(error: PartialError<T>): readonly string[] {
    return error.failures.map(function (failure) {
        return failure.message;
    });
}

export function mapResolvePartialFailure<T>(error: PartialErrorResult): PartialFailure<T> {
    return {
        type: partialFailureType,
        succeeded: [],
        failures: error.error.failures
    };
}
