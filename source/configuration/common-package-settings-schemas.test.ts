import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import {
    checkValidationFailure,
    checkValidationSuccess,
    createTestCasesForOptionalField,
    createTestCasesForRequiredField
} from '../test-libraries/verify-schema-validation.ts';
import {
    commonPackageSettingsMainPackageManifestRequiredSchema,
    commonPackageSettingsSourcesFolderRequiredSchema,
    optionalCommonPackageSettingsSchema,
    requiredCommonPackageSettingsSchema
} from './common-package-settings-schemas.ts';

const validRequiredCommonSettings = { sourcesFolder: 'source', mainPackageManifest: { type: 'module' } };

suite('common-package-settings-schemas', function () {
    suite('common package settings requirements', function () {
        test('optional common settings schema accepts an empty object', function () {
            assert.strictEqual(safeParse(optionalCommonPackageSettingsSchema, {}).success, true);
        });

        test('required common settings schema accepts both required properties', function () {
            assert.strictEqual(
                safeParse(requiredCommonPackageSettingsSchema, {
                    sourcesFolder: 'source',
                    mainPackageManifest: { type: 'module' }
                })
                    .success,
                true
            );
        });

        test('required common settings schema rejects missing sourcesFolder', function () {
            assert.strictEqual(
                safeParse(requiredCommonPackageSettingsSchema, { mainPackageManifest: { type: 'module' } }).success,
                false
            );
        });

        test('required common settings schema rejects missing mainPackageManifest', function () {
            assert.strictEqual(
                safeParse(requiredCommonPackageSettingsSchema, { sourcesFolder: 'source' }).success,
                false
            );
        });

        test('sourcesFolder-required common settings schema accepts sourcesFolder only', function () {
            assert.strictEqual(
                safeParse(commonPackageSettingsSourcesFolderRequiredSchema, { sourcesFolder: 'source' }).success,
                true
            );
        });

        test('mainPackageManifest-required common settings schema accepts mainPackageManifest only', function () {
            assert.strictEqual(
                safeParse(commonPackageSettingsMainPackageManifestRequiredSchema, {
                    mainPackageManifest: { type: 'module' }
                })
                    .success,
                true
            );
        });

        createTestCasesForOptionalField({
            schema: optionalCommonPackageSettingsSchema,
            data: validRequiredCommonSettings,
            path: 'sourcesFolder',
            expectedFieldType: 'string'
        });

        createTestCasesForOptionalField({
            schema: optionalCommonPackageSettingsSchema,
            data: validRequiredCommonSettings,
            path: 'mainPackageManifest',
            expectedFieldType: 'object'
        });

        createTestCasesForRequiredField({
            schema: requiredCommonPackageSettingsSchema,
            data: validRequiredCommonSettings,
            path: 'sourcesFolder',
            expectedFieldType: 'string'
        });

        createTestCasesForRequiredField({
            schema: requiredCommonPackageSettingsSchema,
            data: validRequiredCommonSettings,
            path: 'mainPackageManifest',
            expectedFieldType: 'object'
        });
    });

    suite('common package settings validation failures', function () {
        test(
            'optional common package settings: validation succeeds when empty',
            checkValidationSuccess({
                schema: optionalCommonPackageSettingsSchema,
                data: {},
                expectedData: {}
            })
        );

        test(
            'required common package settings: validation fails when sourcesFolder is missing',
            checkValidationFailure({
                schema: requiredCommonPackageSettingsSchema,
                data: { mainPackageManifest: { type: 'module' } },
                expectedMessages: [ 'at sourcesFolder: missing property' ]
            })
        );

        test(
            'required common package settings: validation fails when mainPackageManifest is missing',
            checkValidationFailure({
                schema: requiredCommonPackageSettingsSchema,
                data: { sourcesFolder: 'source' },
                expectedMessages: [ 'at mainPackageManifest: missing property' ]
            })
        );

        test(
            'sources-folder-required common package settings: validation succeeds without mainPackageManifest',
            checkValidationSuccess({
                schema: commonPackageSettingsSourcesFolderRequiredSchema,
                data: { sourcesFolder: 'source' },
                expectedData: { sourcesFolder: 'source' }
            })
        );

        test(
            'main-package-json-required common package settings: validation succeeds without sourcesFolder',
            checkValidationSuccess({
                schema: commonPackageSettingsMainPackageManifestRequiredSchema,
                data: { mainPackageManifest: { type: 'module' } },
                expectedData: { mainPackageManifest: { type: 'module' } }
            })
        );

        test(
            'required common package settings: validation fails when an additional property is given',
            checkValidationFailure({
                schema: requiredCommonPackageSettingsSchema,
                data: { ...validRequiredCommonSettings, extra: true },
                expectedMessages: [ 'unexpected additional property: "extra"' ]
            })
        );
    });
});
