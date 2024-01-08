import test from 'ava';
import { enums } from '@effect/schema/Schema';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

enum Fruits {
    Apple,
    Banana
}

enum Empty {}

test('formats an enum schema correctly', checkValidationFailure, {
    schema: enums(Fruits),
    data: 42,
    expectedMessages: ['Expected one of ["Apple",0] or ["Banana",1]; but got number']
});

test('formats an empty enum schema correctly', checkValidationFailure, {
    schema: enums(Empty),
    data: 42,
    expectedMessages: ['Expected empty enum; but got number']
});
