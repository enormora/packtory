import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { suite, test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { manualVersioningSettingsSchema } from './manual-versioning-settings.ts';

const provideVersion = () => '1.0.0';

suite('manual-versioning-settings', function () {
    test('manual versioning schema accepts automatic false', function () {
        assert.strictEqual(
            safeParse(manualVersioningSettingsSchema, { automatic: false, version: '1.0.0' }).success,
            true
        );
    });

    test('manual versioning schema accepts provider versioning', function () {
        assert.strictEqual(
            safeParse(manualVersioningSettingsSchema, { automatic: false, provideVersion }).success,
            true
        );
    });

    test('manual versioning schema accepts source versioning', function () {
        assert.strictEqual(
            safeParse(manualVersioningSettingsSchema, { automatic: false, source: 'pull-request-labels' }).success,
            true
        );
    });

    test('manual versioning schema rejects automatic true', function () {
        assert.strictEqual(
            safeParse(manualVersioningSettingsSchema, { automatic: true, version: '1.0.0' }).success,
            false
        );
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
        'manual versioning: validation succeeds with provider versioning',
        checkValidationSuccess({
            schema: manualVersioningSettingsSchema,
            data: { automatic: false, provideVersion },
            expectedData: { automatic: false, provideVersion }
        })
    );

    test(
        'manual versioning: validation succeeds with source versioning',
        checkValidationSuccess({
            schema: manualVersioningSettingsSchema,
            data: { automatic: false, source: 'pull-request-labels' },
            expectedData: { automatic: false, source: 'pull-request-labels' }
        })
    );

    test(
        'manual versioning: validation fails when provideVersion is not a function',
        checkValidationFailure({
            schema: manualVersioningSettingsSchema,
            data: { automatic: false, provideVersion: '1.0.0' },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'manual versioning: validation fails when neither version nor provideVersion is given',
        checkValidationFailure({
            schema: manualVersioningSettingsSchema,
            data: { automatic: false },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'manual versioning: validation fails when multiple manual version choices are given',
        checkValidationFailure({
            schema: manualVersioningSettingsSchema,
            data: { automatic: false, version: '1.0.0', provideVersion, source: 'pull-request-labels' },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'manual versioning: validation fails with automatic true',
        checkValidationFailure({
            schema: manualVersioningSettingsSchema,
            data: { automatic: true, version: '1.0.0' },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );

    test(
        'manual versioning: validation fails when minimumVersion is provided instead of version',
        checkValidationFailure({
            schema: manualVersioningSettingsSchema,
            data: { automatic: false, minimumVersion: '1.0.0' },
            expectedMessages: ['invalid value doesn’t match expected union']
        })
    );
});
