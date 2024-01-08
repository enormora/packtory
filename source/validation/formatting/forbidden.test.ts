import test from 'ava';
import { number, string, transformOrFail } from '@effect/schema/Schema';
import { Effect } from 'effect';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

const asyncSchema = transformOrFail(
    number,
    string,
    (value) => {
        return Effect.succeed(value.toString()).pipe(Effect.delay('1 seconds'));
    },
    (value) => {
        return Effect.succeed(Number.parseInt(value, 10)).pipe(Effect.delay('1 seconds'));
    }
);
test('formats a forbidden async schema correctly', checkValidationFailure, {
    schema: asyncSchema,
    data: 42,
    expectedMessages: ['Forbidden']
});
