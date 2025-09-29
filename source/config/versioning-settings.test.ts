import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { versioningSettingsSchema } from './versioning-settings.ts';

test('validation succeeds when valid automatic versioning settings are given', checkValidationSuccess, {
    schema: versioningSettingsSchema,
    data: { automatic: true }
});

test(
    'validation succeeds when valid automatic versioning settings are given with a minimumVersion',
    checkValidationSuccess,
    {
        schema: versioningSettingsSchema,
        data: { automatic: true, minimumVersion: 'foo' }
    }
);

test('validation succeeds when valid manual versioning settings are given', checkValidationSuccess, {
    schema: versioningSettingsSchema,
    data: { automatic: false, version: '1' }
});

test('validation fails when a non-object is given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: 'foo',
    expectedMessages: ['expected object, but got string']
});

test('validation fails when an empty object is given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: {},
    expectedMessages: ['at automatic: missing property']
});

test('validation fails when automatic is not a boolean', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: 'yes' },
    expectedMessages: ['at automatic: invalid value doesn’t match expected union']
});

test('validation fails when automatic is true and version is given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: true, version: '1' },
    expectedMessages: ['unexpected additional property: "version"']
});

test('validation succeeds when automatic is true and minimumVersion is undefined', checkValidationSuccess, {
    schema: versioningSettingsSchema,
    data: { automatic: true, minimumVersion: undefined }
});

test('validation fails when automatic is true and additional properties are given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: true, minimumVersion: '1', foo: 'bar' },
    expectedMessages: ['unexpected additional property: "foo"']
});

test('validation fails when automatic is true and minimumVersion is given but not a string', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: true, minimumVersion: 42 },
    expectedMessages: ['at minimumVersion: expected string, but got number']
});

test(
    'validation fails when automatic is true and minimumVersion is given but an empty string',
    checkValidationFailure,
    {
        schema: versioningSettingsSchema,
        data: { automatic: true, minimumVersion: '' },
        expectedMessages: ['at minimumVersion: string must contain at least 1 character']
    }
);
test('validation fails when automatic is false and minimumVersion is given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: false, version: '1', minimumVersion: '2' },
    expectedMessages: ['unexpected additional property: "minimumVersion"']
});

test('validation fails when automatic is false and an additional property is given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: false, version: '1', foo: 'bar' },
    expectedMessages: ['unexpected additional property: "foo"']
});

test('validation fails when automatic is false and version is given but not a string', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: false, version: 42 },
    expectedMessages: ['at version: expected string, but got number']
});

test('validation fails when automatic is false and version is given but an empty string', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: false, version: '' },
    expectedMessages: ['at version: string must contain at least 1 character']
});
