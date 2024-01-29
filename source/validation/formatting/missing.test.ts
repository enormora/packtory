import test from 'ava';
import { struct, tuple, string } from '@effect/schema/Schema';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

test('formats correctly for missing property', checkValidationFailure, {
    schema: struct({ foo: string }),
    data: {},
    expectedMessages: ['At foo: missing key or index']
});

test('formats correctly for missing nested property', checkValidationFailure, {
    schema: struct({ foo: struct({ bar: string }) }),
    data: { foo: {} },
    expectedMessages: ['At foo.bar: missing key or index']
});

test('formats correctly for missing index', checkValidationFailure, {
    schema: tuple(string),
    data: [],
    expectedMessages: ['At 0: missing key or index']
});

test('formats correctly for missing nested index', checkValidationFailure, {
    schema: tuple(tuple(string)),
    data: [[]],
    expectedMessages: ['At 0.0: missing key or index']
});

test('formats correctly for missing nested key and index', checkValidationFailure, {
    schema: struct({ foo: tuple(string) }),
    data: { foo: [] },
    expectedMessages: ['At foo.0: missing key or index']
});
