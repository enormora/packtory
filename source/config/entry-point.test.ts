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
    expectedMessages: ['expected object, but got string']
});

test('validation fails when an empty object is given', checkValidationFailure, {
    schema: entryPointSchema,
    data: {},
    expectedMessages: ['at js: missing property']
});

test('validation succeeds when declarationFile is undefined', checkValidationSuccess, {
    schema: entryPointSchema,
    data: { declarationFile: undefined, js: 'foo' }
});

test('validation fails when declarationFile is not a string', checkValidationFailure, {
    schema: entryPointSchema,
    data: { declarationFile: 42, js: 'foo' },
    expectedMessages: ['at declarationFile: expected string, but got number']
});

test('validation fails when declarationFile is an empty string', checkValidationFailure, {
    schema: entryPointSchema,
    data: { declarationFile: '', js: 'foo' },
    expectedMessages: ['at declarationFile: string must contain at least 1 character']
});

test('validation fails when js is not a string', checkValidationFailure, {
    schema: entryPointSchema,
    data: { js: 42 },
    expectedMessages: ['at js: expected string, but got number']
});

test('validation fails when js is an empty string', checkValidationFailure, {
    schema: entryPointSchema,
    data: { js: '' },
    expectedMessages: ['at js: string must contain at least 1 character']
});
