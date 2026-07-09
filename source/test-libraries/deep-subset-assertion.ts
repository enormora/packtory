import assert from 'node:assert';

function isRecordSubset(expected: unknown): expected is Record<string, unknown> {
    return Object.prototype.toString.call(expected) === '[object Object]';
}

function subsetProjection(actual: unknown, expected: unknown): unknown {
    if (Array.isArray(expected)) {
        if (!Array.isArray(actual)) {
            return actual;
        }
        return expected.map(function (expectedItem, index) {
            return subsetProjection(actual[index], expectedItem);
        });
    }

    if (isRecordSubset(expected)) {
        if (actual === null || actual === undefined) {
            return actual;
        }
        return Object.fromEntries(
            Object.entries(expected).map(function ([ key, expectedValue ]) {
                return [ key, subsetProjection((actual as Record<string, unknown>)[key], expectedValue) ];
            })
        );
    }

    return actual;
}

export function assertDeepSubset(actual: unknown, expected: unknown): void {
    assert.deepStrictEqual(subsetProjection(actual, expected), expected);
}

export function assertDefined<T>(value: T | undefined, message = 'expected value to be defined'): asserts value is T {
    if (value === undefined) {
        assert.fail(message);
    }
}
