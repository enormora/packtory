import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.js';
import { additionalFileDescriptionSchema } from './additional-files.js';

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
    expectedMessages: ['Expected object; but got boolean']
});

test('validation fails when the an empty object is given', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: {},
    expectedMessages: ['At sourceFilePath: missing key or index', 'At targetFilePath: missing key or index']
});

test('validation fails when sourceFilePath is missing', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { targetFilePath: 'foo' },
    expectedMessages: ['At sourceFilePath: missing key or index']
});

test('validation fails when sourceFilePath is not a string', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { sourceFilePath: [], targetFilePath: 'foo' },
    expectedMessages: ['At sourceFilePath: expected string; but got array']
});

test('validation fails when sourceFilePath is an empty string', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { sourceFilePath: '', targetFilePath: 'foo' },
    expectedMessages: ['At sourceFilePath: expected a non empty string; but got string']
});

test('validation fails when targetFilePath is missing', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { sourceFilePath: 'foo' },
    expectedMessages: ['At targetFilePath: missing key or index']
});

test('validation fails when targetFilePath is not a string', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { targetFilePath: [], sourceFilePath: 'foo' },
    expectedMessages: ['At targetFilePath: expected string; but got array']
});

test('validation fails when targetFilePath is an empty string', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { targetFilePath: '', sourceFilePath: 'foo' },
    expectedMessages: ['At targetFilePath: expected a non empty string; but got string']
});

test('validation fails when an additional unknown property is given', checkValidationFailure, {
    schema: additionalFileDescriptionSchema,
    data: { targetFilePath: 'bar', sourceFilePath: 'foo', something: 'else' },
    expectedMessages: ['At something: unexpected extra key or index']
});
