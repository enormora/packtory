import assert from 'node:assert';

const observedCallFields = {
    arguments: 'args',
    firstArgument: 'firstArg',
    lastArgument: 'lastArg'
} as const;

function isObservedCallField(key: string): key is keyof typeof observedCallFields {
    return Object.hasOwn(observedCallFields, key);
}

function observedProperty(actual: unknown, key: string): unknown {
    const isObservedCall = Reflect.has(new Object(actual), 'proxy') && Reflect.has(new Object(actual), 'callId');
    const property = isObservedCall && isObservedCallField(key)
        ? observedCallFields[key]
        : key;
    return Reflect.get(new Object(actual), property);
}

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
                return [ key, subsetProjection(observedProperty(new Object(actual), key), expectedValue) ];
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
