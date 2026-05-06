import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { registrySettingsSchema } from './registry-settings.ts';

test('schema accepts registry settings with token only', () => {
    assert.strictEqual(safeParse(registrySettingsSchema, { token: 'foo' }).success, true);
});

test('schema rejects registry settings without token', () => {
    assert.strictEqual(safeParse(registrySettingsSchema, { registryUrl: 'bar' }).success, false);
});

test(
    'validation succeeds when no url is given',
    checkValidationSuccess({
        schema: registrySettingsSchema,
        data: {
            token: 'foo'
        },
        expectedData: {
            token: 'foo'
        }
    })
);

test(
    'validation succeeds when url is given',
    checkValidationSuccess({
        schema: registrySettingsSchema,
        data: {
            token: 'foo',
            registryUrl: 'bar'
        },
        expectedData: {
            token: 'foo',
            registryUrl: 'bar'
        }
    })
);

test(
    'validation fails when a non-object value is given',
    checkValidationFailure({
        schema: registrySettingsSchema,
        data: 'foo',
        expectedMessages: ['expected object, but got string']
    })
);

test(
    'validation fails when an empty object is given',
    checkValidationFailure({
        schema: registrySettingsSchema,
        data: {},
        expectedMessages: ['at token: missing property']
    })
);

test(
    'validation fails when token is not a string',
    checkValidationFailure({
        schema: registrySettingsSchema,
        data: { token: 42 },
        expectedMessages: ['at token: expected string, but got number']
    })
);

test(
    'validation fails when token is undefined',
    checkValidationFailure({
        schema: registrySettingsSchema,
        data: { token: undefined },
        expectedMessages: ['at token: expected string, but got undefined']
    })
);

test(
    'validation fails when token is null',
    checkValidationFailure({
        schema: registrySettingsSchema,
        data: { token: null },
        expectedMessages: ['at token: expected string, but got null']
    })
);

test(
    'validation fails when token is an empty string',
    checkValidationFailure({
        schema: registrySettingsSchema,
        data: { token: '' },
        expectedMessages: ['at token: string must contain at least 1 character']
    })
);

test(
    'validation succeeds when registryUrl is undefined',
    checkValidationSuccess({
        schema: registrySettingsSchema,
        data: { token: 'foo', registryUrl: undefined },
        expectedData: { token: 'foo', registryUrl: undefined }
    })
);

test(
    'validation fails when registryUrl is null',
    checkValidationFailure({
        schema: registrySettingsSchema,
        data: { token: 'foo', registryUrl: null },
        expectedMessages: ['at registryUrl: expected string, but got null']
    })
);

test(
    'validation fails when registryUrl is an empty string',
    checkValidationFailure({
        schema: registrySettingsSchema,
        data: { token: 'foo', registryUrl: '' },
        expectedMessages: ['at registryUrl: string must contain at least 1 character']
    })
);

test(
    'validation fails when an additional property is given',
    checkValidationFailure({
        schema: registrySettingsSchema,
        data: { token: 'foo', extra: 'bar' },
        expectedMessages: ['unexpected additional property: "extra"']
    })
);
