import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import {
    checkValidationFailure,
    checkValidationSuccess,
    createTestCasesForOptionalField,
    createTestCasesForRequiredField
} from '../test-libraries/verify-schema-validation.ts';
import { perPackageSettingsSchema } from './per-package-settings-schema.ts';

const validPerPackageSettings = {
    name: 'pkg',
    roots: { main: { js: 'index.js' } },
    versioning: { automatic: false, version: '1.0.0' },
    bundleDependencies: ['dep'],
    bundlePeerDependencies: ['peer']
};

suite('per-package-settings-schema', function () {
    test('per-package settings schema accepts a valid package definition', function () {
        assert.strictEqual(safeParse(perPackageSettingsSchema, validPerPackageSettings).success, true);
    });

    test('per-package settings schema rejects missing roots', function () {
        assert.strictEqual(safeParse(perPackageSettingsSchema, { name: 'pkg' }).success, false);
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
        path: 'roots',
        expectedFieldType: 'record'
    });

    test(
        'per package settings schema: validation succeeds when versioning is missing',
        checkValidationSuccess({
            schema: perPackageSettingsSchema,
            data: {
                name: validPerPackageSettings.name,
                roots: validPerPackageSettings.roots,
                bundleDependencies: validPerPackageSettings.bundleDependencies,
                bundlePeerDependencies: validPerPackageSettings.bundlePeerDependencies
            },
            expectedData: {
                name: validPerPackageSettings.name,
                roots: validPerPackageSettings.roots,
                bundleDependencies: validPerPackageSettings.bundleDependencies,
                bundlePeerDependencies: validPerPackageSettings.bundlePeerDependencies
            }
        })
    );

    test(
        'per package settings schema: validation succeeds when versioning is undefined',
        checkValidationSuccess({
            schema: perPackageSettingsSchema,
            data: {
                ...validPerPackageSettings,
                versioning: undefined
            },
            expectedData: {
                ...validPerPackageSettings,
                versioning: undefined
            }
        })
    );

    test(
        'per package settings schema: validation fails when versioning is null',
        checkValidationFailure({
            schema: perPackageSettingsSchema,
            data: { ...validPerPackageSettings, versioning: null },
            expectedMessages: ['at versioning: invalid value: expected object, but got null']
        })
    );

    test(
        'per package settings schema: validation fails when versioning is not an object',
        checkValidationFailure({
            schema: perPackageSettingsSchema,
            data: { ...validPerPackageSettings, versioning: 42 },
            expectedMessages: ['at versioning: invalid value: expected object, but got number']
        })
    );

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

    createTestCasesForOptionalField({
        schema: perPackageSettingsSchema,
        data: validPerPackageSettings,
        path: 'checks',
        expectedFieldType: 'object'
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
            data: { roots: { main: { js: 'index.js' } } },
            expectedMessages: ['at name: missing property']
        })
    );

    test(
        'per package settings schema: validation fails when roots is missing',
        checkValidationFailure({
            schema: perPackageSettingsSchema,
            data: { name: 'pkg' },
            expectedMessages: ['at roots: missing property']
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
});
