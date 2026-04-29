import assert from 'node:assert';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { manualVersioningSettingsSchema } from './manual-versioning-settings.ts';

test('manual versioning schema accepts automatic false', () => {
    assert.strictEqual(manualVersioningSettingsSchema.safeParse({ automatic: false, version: '1.0.0' }).success, true);
});

test('manual versioning schema rejects automatic true', () => {
    assert.strictEqual(manualVersioningSettingsSchema.safeParse({ automatic: true, version: '1.0.0' }).success, false);
});

test(
    'manual versioning: validation succeeds with automatic false',
    checkValidationSuccess({
        schema: manualVersioningSettingsSchema,
        data: { automatic: false, version: '1.0.0' },
        expectedData: { automatic: false, version: '1.0.0' }
    })
);

test(
    'manual versioning: validation fails with automatic true',
    checkValidationFailure({
        schema: manualVersioningSettingsSchema,
        data: { automatic: true, version: '1.0.0' },
        expectedMessages: ['at automatic: invalid literal: expected false, but got boolean']
    })
);

test(
    'manual versioning: validation fails when minimumVersion is provided instead of version',
    checkValidationFailure({
        schema: manualVersioningSettingsSchema,
        data: { automatic: false, minimumVersion: '1.0.0' },
        expectedMessages: ['at version: missing property', 'unexpected additional property: "minimumVersion"']
    })
);
