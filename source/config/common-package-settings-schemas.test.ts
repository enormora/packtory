import assert from 'node:assert';
import { test } from 'mocha';
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

test('optional common settings schema accepts an empty object', () => {
    assert.strictEqual(optionalCommonPackageSettingsSchema.safeParse({}).success, true);
});

test('required common settings schema accepts both required properties', () => {
    assert.strictEqual(
        requiredCommonPackageSettingsSchema.safeParse({ sourcesFolder: 'src', mainPackageJson: {} }).success,
        true
    );
});

test('required common settings schema rejects missing sourcesFolder', () => {
    assert.strictEqual(requiredCommonPackageSettingsSchema.safeParse({ mainPackageJson: {} }).success, false);
});

test('required common settings schema rejects missing mainPackageJson', () => {
    assert.strictEqual(requiredCommonPackageSettingsSchema.safeParse({ sourcesFolder: 'src' }).success, false);
});

test('sourcesFolder-required common settings schema accepts sourcesFolder only', () => {
    assert.strictEqual(
        commonPackageSettingsSourcesFolderRequiredSchema.safeParse({ sourcesFolder: 'src' }).success,
        true
    );
});

test('mainPackageJson-required common settings schema accepts mainPackageJson only', () => {
    assert.strictEqual(
        commonPackageSettingsMainPackageJsonRequiredSchema.safeParse({ mainPackageJson: {} }).success,
        true
    );
});

const validRequiredCommonSettings = { sourcesFolder: 'src', mainPackageJson: {} };

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
        data: { mainPackageJson: {} },
        expectedMessages: ['at sourcesFolder: missing property']
    })
);

test(
    'required common package settings: validation fails when mainPackageJson is missing',
    checkValidationFailure({
        schema: requiredCommonPackageSettingsSchema,
        data: { sourcesFolder: 'src' },
        expectedMessages: ['at mainPackageJson: missing property']
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
        data: { mainPackageJson: {} },
        expectedData: { mainPackageJson: {} }
    })
);

test(
    'required common package settings: validation fails when an additional property is given',
    checkValidationFailure({
        schema: requiredCommonPackageSettingsSchema,
        data: { ...validRequiredCommonSettings, extra: true },
        expectedMessages: ['unexpected additional property: "extra"']
    })
);
