import test from 'ava';
import { struct, tuple, string, suspend } from '@effect/schema/Schema';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

test('formats correctly invalid primitive', checkValidationFailure, {
    schema: string,
    data: 42,
    expectedMessages: ['Expected string; but got number']
});

test('formats correctly invalid object', checkValidationFailure, {
    schema: struct({ foo: string }),
    data: 42,
    expectedMessages: ['Expected object; but got number']
});

test('formats correctly invalid object property', checkValidationFailure, {
    schema: struct({ foo: string }),
    data: { foo: 42 },
    expectedMessages: ['At foo: expected string; but got number']
});

test('formats correctly invalid tuple', checkValidationFailure, {
    schema: tuple(string),
    data: 42,
    expectedMessages: ['Expected array; but got number']
});

test('formats correctly invalid tuple element', checkValidationFailure, {
    schema: tuple(string),
    data: [42],
    expectedMessages: ['At 0: expected string; but got number']
});

test('formats correctly invalid suspended value', checkValidationFailure, {
    schema: suspend(() => {
        return string;
    }),
    data: 42,
    expectedMessages: ['Expected string; but got number']
});
