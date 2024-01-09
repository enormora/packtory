import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.js';
import { entryPointSchema } from './entry-point.js';

test('validation succeeds when a minimal entryPoint is given', checkValidationSuccess, {
    schema: entryPointSchema,
    data: {
        js: 'foo'
    }
});

test('validation succeeds when optional declarationFile is given', checkValidationSuccess, {
    schema: entryPointSchema,
    data: {
        js: 'foo',
        declarationFile: 'bar'
    }
});

test('validation fails when a non-object value is given', checkValidationFailure, {
    schema: entryPointSchema,
    data: 'foo',
    expectedMessages: ['Expected object; but got string']
});

test('validation fails when an empty object is given', checkValidationFailure, {
    schema: entryPointSchema,
    data: {},
    expectedMessages: ['At js: missing key or index']
});

test('validation fails when declarationFile is undefined', checkValidationFailure, {
    schema: entryPointSchema,
    data: { declarationFile: undefined, js: 'foo' },
    expectedMessages: ['At declarationFile: expected string; but got undefined']
});

test('validation fails when declarationFile is not a string', checkValidationFailure, {
    schema: entryPointSchema,
    data: { declarationFile: 42, js: 'foo' },
    expectedMessages: ['At declarationFile: expected string; but got number']
});

test('validation fails when declarationFile is an empty string', checkValidationFailure, {
    schema: entryPointSchema,
    data: { declarationFile: '', js: 'foo' },
    expectedMessages: ['At declarationFile: expected a non empty string; but got string']
});

test('validation fails when js is not a string', checkValidationFailure, {
    schema: entryPointSchema,
    data: { js: 42 },
    expectedMessages: ['At js: expected string; but got number']
});

test('validation fails when js is an empty string', checkValidationFailure, {
    schema: entryPointSchema,
    data: { js: '' },
    expectedMessages: ['At js: expected a non empty string; but got string']
});
