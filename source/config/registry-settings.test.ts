import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { registrySettingsSchema } from './registry-settings.ts';

test('validation succeeds when no url is given', checkValidationSuccess, {
    schema: registrySettingsSchema,
    data: {
        token: 'foo'
    }
});

test('validation succeeds when url is given', checkValidationSuccess, {
    schema: registrySettingsSchema,
    data: {
        token: 'foo',
        registryUrl: 'bar'
    }
});

test('validation fails when a non-object value is given', checkValidationFailure, {
    schema: registrySettingsSchema,
    data: 'foo',
    expectedMessages: ['expected object, but got string']
});

test('validation fails when an empty object is given', checkValidationFailure, {
    schema: registrySettingsSchema,
    data: {},
    expectedMessages: ['at token: missing property']
});

test('validation fails when token is not a string', checkValidationFailure, {
    schema: registrySettingsSchema,
    data: { token: 42 },
    expectedMessages: ['at token: expected string, but got number']
});

test('validation fails when token is an empty string', checkValidationFailure, {
    schema: registrySettingsSchema,
    data: { token: '' },
    expectedMessages: ['at token: string must contain at least 1 character']
});
