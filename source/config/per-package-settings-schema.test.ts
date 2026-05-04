import assert from 'node:assert';
import { test } from 'mocha';
import {
    checkValidationFailure,
    checkValidationSuccess,
    createTestCasesForOptionalField,
    createTestCasesForRequiredField
} from '../test-libraries/verify-schema-validation.ts';
import { perPackageSettingsSchema } from './per-package-settings-schema.ts';

const validPerPackageSettings = {
    name: 'pkg',
    entryPoints: [{ js: 'index.js' }],
    versioning: { automatic: false, version: '1.0.0' },
    bundleDependencies: ['dep'],
    bundlePeerDependencies: ['peer']
};

test('per-package settings schema accepts a valid package definition', () => {
    assert.strictEqual(perPackageSettingsSchema.safeParse(validPerPackageSettings).success, true);
});

test('per-package settings schema rejects empty entryPoints', () => {
    assert.strictEqual(
        perPackageSettingsSchema.safeParse({ ...validPerPackageSettings, entryPoints: [] }).success,
        false
    );
});

createTestCasesForRequiredField({
    schema: perPackageSettingsSchema,
    data: validPerPackageSettings,
    path: 'name',
    expectedFieldType: 'string'
});

createTestCasesForRequiredField({
    schema: perPackageSettingsSchema,
    data: validPerPackageSettings,
    path: 'entryPoints',
    expectedFieldType: 'tuple'
});

createTestCasesForOptionalField({
    schema: perPackageSettingsSchema,
    data: validPerPackageSettings,
    path: 'versioning',
    expectedFieldType: 'object'
});

createTestCasesForOptionalField({
    schema: perPackageSettingsSchema,
    data: validPerPackageSettings,
    path: 'bundleDependencies',
    expectedFieldType: 'array'
});

createTestCasesForOptionalField({
    schema: perPackageSettingsSchema,
    data: validPerPackageSettings,
    path: 'bundlePeerDependencies',
    expectedFieldType: 'array'
});

test(
    'per package settings schema: validation succeeds with required fields',
    checkValidationSuccess({
        schema: perPackageSettingsSchema,
        data: validPerPackageSettings,
        expectedData: validPerPackageSettings
    })
);

test(
    'per package settings schema: validation fails when name is missing',
    checkValidationFailure({
        schema: perPackageSettingsSchema,
        data: { entryPoints: [{ js: 'index.js' }] },
        expectedMessages: ['at name: missing property']
    })
);

test(
    'per package settings schema: validation fails when entryPoints is empty',
    checkValidationFailure({
        schema: perPackageSettingsSchema,
        data: { ...validPerPackageSettings, entryPoints: [] },
        expectedMessages: ['at entryPoints[0]: missing key']
    })
);

test(
    'per package settings schema: validation fails when an additional property is given',
    checkValidationFailure({
        schema: perPackageSettingsSchema,
        data: { ...validPerPackageSettings, extra: true },
        expectedMessages: ['unexpected additional property: "extra"']
    })
);
