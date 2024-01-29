import test from 'ava';
import { string } from '@effect/schema/Schema';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

test('formats correctly the actual value for arrays', checkValidationFailure, {
    schema: string,
    data: [],
    expectedMessages: ['Expected string; but got array']
});

test('formats correctly the actual value for objects', checkValidationFailure, {
    schema: string,
    data: {},
    expectedMessages: ['Expected string; but got object']
});

test('formats correctly the actual value for primitives', checkValidationFailure, {
    schema: string,
    data: 42,
    expectedMessages: ['Expected string; but got number']
});

test('formats correctly the actual value for null', checkValidationFailure, {
    schema: string,
    data: null,
    expectedMessages: ['Expected string; but got null']
});
