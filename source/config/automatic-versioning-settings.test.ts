import assert from 'node:assert';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { automaticVersioningSettingsSchema } from './automatic-versioning-settings.ts';

test('automatic versioning schema accepts automatic true', () => {
    assert.strictEqual(
        automaticVersioningSettingsSchema.safeParse({ automatic: true, minimumVersion: '1.0.0' }).success,
        true
    );
});

test('automatic versioning schema rejects automatic false', () => {
    assert.strictEqual(
        automaticVersioningSettingsSchema.safeParse({ automatic: false, minimumVersion: '1.0.0' }).success,
        false
    );
});

test(
    'automatic versioning: validation succeeds with automatic true',
    checkValidationSuccess({
        schema: automaticVersioningSettingsSchema,
        data: { automatic: true, minimumVersion: '1.0.0' },
        expectedData: { automatic: true, minimumVersion: '1.0.0' }
    })
);

test(
    'automatic versioning: validation fails with automatic false',
    checkValidationFailure({
        schema: automaticVersioningSettingsSchema,
        data: { automatic: false, minimumVersion: '1.0.0' },
        expectedMessages: ['at automatic: invalid literal: expected true, but got boolean']
    })
);

test(
    'automatic versioning: validation fails when version is provided instead of minimumVersion',
    checkValidationFailure({
        schema: automaticVersioningSettingsSchema,
        data: { automatic: true, version: '1.0.0' },
        expectedMessages: ['unexpected additional property: "version"']
    })
);
