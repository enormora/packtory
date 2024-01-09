import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.js';
import { registrySettingsSchema } from './registry-settings.js';

test('validation succeeds when valid registry settings are given', checkValidationSuccess, {
    schema: registrySettingsSchema,
    data: {
        token: 'foo'
    }
});

test('validation fails when a non-object value is given', checkValidationFailure, {
    schema: registrySettingsSchema,
    data: 'foo',
    expectedMessages: ['Expected object; but got string']
});

test('validation fails when an empty object is given', checkValidationFailure, {
    schema: registrySettingsSchema,
    data: {},
    expectedMessages: ['At token: missing key or index']
});

test('validation fails when token is not a string', checkValidationFailure, {
    schema: registrySettingsSchema,
    data: { token: 42 },
    expectedMessages: ['At token: expected string; but got number']
});

test('validation fails when token is an empty string', checkValidationFailure, {
    schema: registrySettingsSchema,
    data: { token: '' },
    expectedMessages: ['At token: expected a non empty string; but got string']
});
