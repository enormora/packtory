import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { versioningSettingsSchema } from './versioning-settings.ts';

suite('versioning-settings', function () {
    suite('versioning schema branches', function () {
        test('schema accepts the automatic versioning branch', function () {
            assert.strictEqual(
                safeParse(versioningSettingsSchema, { automatic: true, minimumVersion: 'foo' }).success,
                true
            );
        });

        test('schema accepts the manual versioning branch', function () {
            assert.strictEqual(safeParse(versioningSettingsSchema, { automatic: false, version: '1' }).success, true);
        });

        test('schema accepts the provider manual versioning branch', function () {
            assert.strictEqual(
                safeParse(versioningSettingsSchema, {
                    automatic: false,
                    provideVersion() {
                        return '1';
                    }
                })
                    .success,
                true
            );
        });

        test('schema accepts the source manual versioning branch', function () {
            assert.strictEqual(
                safeParse(versioningSettingsSchema, { automatic: false, source: 'pull-request-labels' }).success,
                true
            );
        });

        test('schema rejects mixing automatic with manual-only fields', function () {
            assert.strictEqual(safeParse(versioningSettingsSchema, { automatic: true, version: '1' }).success, false);
        });

        test(
            'validation succeeds when valid automatic versioning settings are given',
            checkValidationSuccess({
                schema: versioningSettingsSchema,
                data: { automatic: true },
                expectedData: { automatic: true }
            })
        );

        test(
            'validation succeeds when valid automatic versioning settings are given with a minimumVersion',
            checkValidationSuccess({
                schema: versioningSettingsSchema,
                data: { automatic: true, minimumVersion: 'foo' },
                expectedData: { automatic: true, minimumVersion: 'foo' }
            })
        );

        test(
            'validation succeeds when valid manual versioning settings are given',
            checkValidationSuccess({
                schema: versioningSettingsSchema,
                data: { automatic: false, version: '1' },
                expectedData: { automatic: false, version: '1' }
            })
        );
    });

    suite('provider versioning validation', function () {
        test('validation succeeds when valid provider manual versioning settings are given', function () {
            const provideVersion = function (): string {
                return '1';
            };
            const result = safeParse(versioningSettingsSchema, { automatic: false, provideVersion });

            if (!result.success) {
                assert.fail(`Validation failed with: ${result.error.message}`);
            }
            assert.deepStrictEqual(result.data, { automatic: false, provideVersion });
        });

        test(
            'validation succeeds when valid source manual versioning settings are given',
            checkValidationSuccess({
                schema: versioningSettingsSchema,
                data: { automatic: false, source: 'pull-request-labels' },
                expectedData: { automatic: false, source: 'pull-request-labels' }
            })
        );

        test(
            'validation fails when a non-object is given',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: 'foo',
                expectedMessages: [ 'invalid value: expected object, but got string' ]
            })
        );

        test(
            'validation fails when an empty object is given',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: {},
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when automatic is not a boolean',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: 'yes' },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when automatic is undefined',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: undefined },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when automatic is null',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: null },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when automatic is true and version is given',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: true, version: '1' },
                expectedMessages: [ 'unexpected additional property: "version"' ]
            })
        );
    });

    suite('source versioning validation', function () {
        test(
            'validation succeeds when automatic is true and minimumVersion is undefined',
            checkValidationSuccess({
                schema: versioningSettingsSchema,
                data: { automatic: true, minimumVersion: undefined },
                expectedData: { automatic: true, minimumVersion: undefined }
            })
        );

        test(
            'validation fails when automatic is true and additional properties are given',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: true, minimumVersion: '1', foo: 'bar' },
                expectedMessages: [ 'unexpected additional property: "foo"' ]
            })
        );

        test(
            'validation fails when automatic is true and minimumVersion is given but not a string',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: true, minimumVersion: 42 },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when automatic is true and minimumVersion is null',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: true, minimumVersion: null },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when automatic is true and minimumVersion is given but an empty string',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: true, minimumVersion: '' },
                expectedMessages: [ 'at minimumVersion: string must contain at least 1 character' ]
            })
        );

        test(
            'validation fails when automatic is false and minimumVersion is given',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: false, version: '1', minimumVersion: '2' },
                expectedMessages: [ 'unexpected additional property: "minimumVersion"' ]
            })
        );

        test(
            'validation fails when automatic is false and both manual version sources are given',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: {
                    automatic: false,
                    version: '1',
                    provideVersion() {
                        return '2';
                    },
                    source: 'pull-request-labels'
                },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when automatic is false and source is unknown',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: false, source: 'unknown' },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );
    });

    suite('versioning validation failures', function () {
        test(
            'validation fails when automatic is false and an additional property is given',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: false, version: '1', foo: 'bar' },
                expectedMessages: [ 'unexpected additional property: "foo"' ]
            })
        );

        test(
            'validation fails when automatic is false and version is given but not a string',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: false, version: 42 },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when automatic is false and version is undefined',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: false, version: undefined },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when automatic is false and version is null',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: false, version: null },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when automatic is false and version is given but an empty string',
            checkValidationFailure({
                schema: versioningSettingsSchema,
                data: { automatic: false, version: '' },
                expectedMessages: [ 'at version: string must contain at least 1 character' ]
            })
        );
    });
});
