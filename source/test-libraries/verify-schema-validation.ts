import test from 'ava';
import type { Schema } from '@effect/schema/Schema';
import { validateAgainstSchema } from '../validation/validate.js';

type ValidationSuccessTestCase = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- https://github.com/microsoft/TypeScript/issues/1213
    readonly schema: Schema<any>;
    readonly data: unknown;
    readonly expectedData?: unknown;
};

export const checkValidationSuccess = test.macro((t, testCase: Readonly<ValidationSuccessTestCase>) => {
    const result = validateAgainstSchema(testCase.schema, testCase.data);

    if (result.isOk) {
        if ('expectedData' in testCase) {
            t.deepEqual(result.value, testCase.expectedData);
        }

        t.pass('Validation succeeded');
    } else {
        t.fail(`Validation failed with: ${result.error.summary}`);
    }
});

type ValidationFailureTestCase = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- https://github.com/microsoft/TypeScript/issues/1213
    readonly schema: Schema<any>;
    readonly data: unknown;
    readonly expectedMessages: string[];
};

export const checkValidationFailure = test.macro((t, testCase: Readonly<ValidationFailureTestCase>) => {
    const result = validateAgainstSchema(testCase.schema, testCase.data);

    if (result.isOk) {
        t.fail('Validation succeeded but a failure was expected');
    } else {
        t.deepEqual(result.error.issues, testCase.expectedMessages);
    }
});
