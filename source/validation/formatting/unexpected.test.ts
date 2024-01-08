import test from 'ava';
import { struct, tuple, string } from '@effect/schema/Schema';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

test('formats correctly for excess properties', checkValidationFailure, {
    schema: struct({ foo: string }),
    data: {foo: '', bar: '' },
    expectedMessages: [
        'At bar: unexpected extra key or index'
    ]
});

test('formats correctly for excess nested properties', checkValidationFailure, {
    schema: struct({ foo: struct({ bar: string }) }),
    data: {foo: { bar: '', baz: '' } },
    expectedMessages: [
        'At foo.baz: unexpected extra key or index'
    ]
});

test('formats correctly for excess index', checkValidationFailure, {
    schema: tuple(string),
    data: ['', ''],
    expectedMessages: [
        'At 1: unexpected extra key or index'
    ]
});

test('formats correctly for excess nested index', checkValidationFailure, {
    schema: tuple(tuple(string)),
    data: [['', '']],
    expectedMessages: [
        'At 0.1: unexpected extra key or index'
    ]
});

test('formats correctly for excess nested key and index', checkValidationFailure, {
    schema: struct({ foo: tuple(string) }),
    data: { foo: ['', ''] },
    expectedMessages: [
        'At foo.1: unexpected extra key or index'
    ]
});
