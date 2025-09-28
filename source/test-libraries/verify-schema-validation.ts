import { safeParse } from '@schema-hub/zod-error-formatter';
import test from 'ava';
import type { $ZodType } from 'zod/v4/core';

type ValidationSuccessTestCase = {
    readonly schema: $ZodType;
    readonly data: unknown;
    readonly expectedData?: unknown;
};

export const checkValidationSuccess = test.macro((t, testCase: Readonly<ValidationSuccessTestCase>) => {
    const result = safeParse(testCase.schema, testCase.data);

    if (result.success) {
        if ('expectedData' in testCase) {
            t.deepEqual(result.data, testCase.expectedData);
        }

        t.pass('Validation succeeded');
    } else {
        t.fail(`Validation failed with: ${result.error.message}`);
    }
});

type ValidationFailureTestCase = {
    readonly schema: $ZodType;
    readonly data: unknown;
    readonly expectedMessages: string[];
};

export const checkValidationFailure = test.macro((t, testCase: Readonly<ValidationFailureTestCase>) => {
    const result = safeParse(testCase.schema, testCase.data);

    if (result.success) {
        t.fail('Validation succeeded but a failure was expected');
    } else {
        t.deepEqual(result.error.issues, testCase.expectedMessages);
    }
});
