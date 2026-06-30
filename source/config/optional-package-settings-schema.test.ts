import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { suite, test } from 'mocha';
import {
    checkValidationFailure,
    checkValidationSuccess,
    createTestCasesForOptionalField
} from '../test-libraries/verify-schema-validation.ts';
import { optionalPackageSettingsSchema } from './optional-package-settings-schema.ts';

const validOptionalPackageSettings = {
    additionalFiles: [ { sourceFilePath: 'README.md', targetFilePath: 'README.md' } ],
    includeSourceMapFiles: true,
    additionalPackageJsonAttributes: { license: 'MIT' }
};

suite('optional-package-settings-schema', function () {
    test('optional package settings schema accepts an empty object', function () {
        assert.strictEqual(safeParse(optionalPackageSettingsSchema, {}).success, true);
    });

    test('optional package settings schema rejects an invalid includeSourceMapFiles value', function () {
        assert.strictEqual(safeParse(optionalPackageSettingsSchema, { includeSourceMapFiles: 'yes' }).success, false);
    });

    createTestCasesForOptionalField({
        schema: optionalPackageSettingsSchema,
        data: validOptionalPackageSettings,
        path: 'additionalFiles',
        expectedFieldType: 'array'
    });

    createTestCasesForOptionalField({
        schema: optionalPackageSettingsSchema,
        data: validOptionalPackageSettings,
        path: 'includeSourceMapFiles',
        expectedFieldType: 'boolean'
    });

    createTestCasesForOptionalField({
        schema: optionalPackageSettingsSchema,
        data: validOptionalPackageSettings,
        path: 'additionalPackageJsonAttributes',
        expectedFieldType: 'record'
    });

    test(
        'optional package settings schema: validation succeeds when empty',
        checkValidationSuccess({
            schema: optionalPackageSettingsSchema,
            data: {},
            expectedData: {}
        })
    );

    test(
        'optional package settings schema: validation succeeds with all optional values',
        checkValidationSuccess({
            schema: optionalPackageSettingsSchema,
            data: validOptionalPackageSettings,
            expectedData: validOptionalPackageSettings
        })
    );

    test(
        'optional package settings schema: validation fails when includeSourceMapFiles is not boolean',
        checkValidationFailure({
            schema: optionalPackageSettingsSchema,
            data: { includeSourceMapFiles: 'yes' },
            expectedMessages: [ 'at includeSourceMapFiles: expected boolean, but got string' ]
        })
    );

    test(
        'optional package settings schema: validation fails when an additional property is given',
        checkValidationFailure({
            schema: optionalPackageSettingsSchema,
            data: { extra: true },
            expectedMessages: [ 'unexpected additional property: "extra"' ]
        })
    );
});
