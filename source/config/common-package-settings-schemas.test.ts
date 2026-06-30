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
    commonPackageSettingsMainPackageJsonRequiredSchema,
    commonPackageSettingsSourcesFolderRequiredSchema,
    optionalCommonPackageSettingsSchema,
    requiredCommonPackageSettingsSchema
} from './common-package-settings-schemas.ts';

const validRequiredCommonSettings = { sourcesFolder: 'src', mainPackageJson: { type: 'module' } };

suite('common-package-settings-schemas', function () {
    suite('common package settings requirements', function () {
        test('optional common settings schema accepts an empty object', function () {
            assert.strictEqual(safeParse(optionalCommonPackageSettingsSchema, {}).success, true);
        });

        test('required common settings schema accepts both required properties', function () {
            assert.strictEqual(
                safeParse(requiredCommonPackageSettingsSchema, {
                    sourcesFolder: 'src',
                    mainPackageJson: { type: 'module' }
                })
                    .success,
                true
            );
        });

        test('required common settings schema rejects missing sourcesFolder', function () {
            assert.strictEqual(
                safeParse(requiredCommonPackageSettingsSchema, { mainPackageJson: { type: 'module' } }).success,
                false
            );
        });

        test('required common settings schema rejects missing mainPackageJson', function () {
            assert.strictEqual(safeParse(requiredCommonPackageSettingsSchema, { sourcesFolder: 'src' }).success, false);
        });

        test('sourcesFolder-required common settings schema accepts sourcesFolder only', function () {
            assert.strictEqual(
                safeParse(commonPackageSettingsSourcesFolderRequiredSchema, { sourcesFolder: 'src' }).success,
                true
            );
        });

        test('mainPackageJson-required common settings schema accepts mainPackageJson only', function () {
            assert.strictEqual(
                safeParse(commonPackageSettingsMainPackageJsonRequiredSchema, { mainPackageJson: { type: 'module' } })
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
            path: 'mainPackageJson',
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
            path: 'mainPackageJson',
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
                data: { mainPackageJson: { type: 'module' } },
                expectedMessages: [ 'at sourcesFolder: missing property' ]
            })
        );

        test(
            'required common package settings: validation fails when mainPackageJson is missing',
            checkValidationFailure({
                schema: requiredCommonPackageSettingsSchema,
                data: { sourcesFolder: 'src' },
                expectedMessages: [ 'at mainPackageJson: missing property' ]
            })
        );

        test(
            'sources-folder-required common package settings: validation succeeds without mainPackageJson',
            checkValidationSuccess({
                schema: commonPackageSettingsSourcesFolderRequiredSchema,
                data: { sourcesFolder: 'src' },
                expectedData: { sourcesFolder: 'src' }
            })
        );

        test(
            'main-package-json-required common package settings: validation succeeds without sourcesFolder',
            checkValidationSuccess({
                schema: commonPackageSettingsMainPackageJsonRequiredSchema,
                data: { mainPackageJson: { type: 'module' } },
                expectedData: { mainPackageJson: { type: 'module' } }
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
