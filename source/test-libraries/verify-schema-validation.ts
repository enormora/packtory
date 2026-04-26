import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import type { Func } from 'mocha';
import type { $ZodType } from 'zod/v4/core';

type ValidationSuccessTestCase = {
    readonly schema: $ZodType;
    readonly data: unknown;
    readonly expectedData?: unknown;
};

export function checkValidationSuccess(testCase: Readonly<ValidationSuccessTestCase>): Func {
    return () => {
        const result = safeParse(testCase.schema, testCase.data);

        if (result.success) {
            if ('expectedData' in testCase) {
                assert.deepStrictEqual(result.data, testCase.expectedData);
            }

            return;
        }

        assert.fail(`Validation failed with: ${result.error.message}`);
    };
}

type ValidationFailureTestCase = {
    readonly schema: $ZodType;
    readonly data: unknown;
    readonly expectedMessages: string[];
};

export function checkValidationFailure(testCase: Readonly<ValidationFailureTestCase>): Func {
    return () => {
        const result = safeParse(testCase.schema, testCase.data);

        if (result.success) {
            assert.fail('Validation succeeded but a failure was expected');
        } else {
            assert.deepStrictEqual(result.error.issues, testCase.expectedMessages);
        }
    };
}
