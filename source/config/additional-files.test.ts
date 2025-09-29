import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { additionalFileDescriptionSchema } from './additional-files.ts';

test('validation succeeds when valid data is given', checkValidationSuccess, {
    schema: additionalFileDescriptionSchema,
    data: {
        sourceFilePath: 'foo',
        targetFilePath: 'bar'
    }
});

test('validation fails when a non-object is given', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: true,
    expectedMessages: ['expected object, but got boolean']
});

test('validation fails when the an empty object is given', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: {},
    expectedMessages: ['at sourceFilePath: missing property', 'at targetFilePath: missing property']
});

test('validation fails when sourceFilePath is missing', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { targetFilePath: 'foo' },
    expectedMessages: ['at sourceFilePath: missing property']
});

test('validation fails when sourceFilePath is not a string', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { sourceFilePath: [], targetFilePath: 'foo' },
    expectedMessages: [
        'at sourceFilePath: expected string, but got array',
        'at sourceFilePath: array must contain at least 1 element'
    ]
});

test('validation fails when sourceFilePath is an empty string', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { sourceFilePath: '', targetFilePath: 'foo' },
    expectedMessages: ['at sourceFilePath: string must contain at least 1 character']
});

test('validation fails when targetFilePath is missing', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { sourceFilePath: 'foo' },
    expectedMessages: ['at targetFilePath: missing property']
});

test('validation fails when targetFilePath is not a string', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { targetFilePath: [], sourceFilePath: 'foo' },
    expectedMessages: [
        'at targetFilePath: expected string, but got array',
        'at targetFilePath: array must contain at least 1 element'
    ]
});

test('validation fails when targetFilePath is an empty string', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { targetFilePath: '', sourceFilePath: 'foo' },
    expectedMessages: ['at targetFilePath: string must contain at least 1 character']
});

test('validation fails when an additional unknown property is given', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { targetFilePath: 'bar', sourceFilePath: 'foo', something: 'else' },
    expectedMessages: ['unexpected additional property: "something"']
});
