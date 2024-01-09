import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.js';
import { versioningSettingsSchema } from './versioning-settings.js';

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
    expectedMessages: ['Expected object; but got string']
});

test('validation fails when an empty object is given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: {},
    expectedMessages: ['At automatic: missing key or index']
});

test('validation fails when automatic is not a boolean', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: 'yes' },
    expectedMessages: ['At automatic: expected boolean; but got string']
});

test('validation fails when automatic is true and version is given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: true, version: '1' },
    expectedMessages: ['At version: unexpected extra key or index']
});

test('validation fails when automatic is true and minimumVersion is undefined', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: true, minimumVersion: undefined },
    expectedMessages: ['At minimumVersion: expected string; but got undefined']
});

test('validation fails when automatic is true and additional properties are given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: true, minimumVersion: '1', foo: 'bar' },
    expectedMessages: ['At foo: unexpected extra key or index']
});

test('validation fails when automatic is true and minimumVersion is given but not a string', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: true, minimumVersion: 42 },
    expectedMessages: ['At minimumVersion: expected string; but got number']
});

test(
    'validation fails when automatic is true and minimumVersion is given but an empty string',
    checkValidationFailure,
    {
        schema: versioningSettingsSchema,
        data: { automatic: true, minimumVersion: '' },
        expectedMessages: ['At minimumVersion: expected a non empty string; but got string']
    }
);
test('validation fails when automatic is false and minimumVersion is given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: false, version: '1', minimumVersion: '2' },
    expectedMessages: ['At minimumVersion: unexpected extra key or index']
});

test('validation fails when automatic is false and an additional property is given', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: false, version: '1', foo: 'bar' },
    expectedMessages: ['At foo: unexpected extra key or index']
});

test('validation fails when automatic is false and version is given but not a string', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: false, version: 42 },
    expectedMessages: ['At version: expected string; but got number']
});

test('validation fails when automatic is false and version is given but an empty string', checkValidationFailure, {
    schema: versioningSettingsSchema,
    data: { automatic: false, version: '' },
    expectedMessages: ['At version: expected a non empty string; but got string']
});
