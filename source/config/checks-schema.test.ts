import assert from 'node:assert';
import { test } from 'mocha';
import {
    checkValidationFailure,
    checkValidationSuccess,
    createTestCasesForOptionalField,
    createTestCasesForRequiredField
} from '../test-libraries/verify-schema-validation.ts';
import { checksSchema } from './checks-schema.ts';

test('schema accepts valid noDuplicatedFiles settings', () => {
    assert.strictEqual(
        checksSchema.safeParse({ noDuplicatedFiles: { enabled: true, allowList: ['src/index.ts'] } }).success,
        true
    );
});

test('schema rejects noDuplicatedFiles settings without enabled', () => {
    assert.strictEqual(checksSchema.safeParse({ noDuplicatedFiles: { allowList: ['src/index.ts'] } }).success, false);
});

test('schema accepts empty checks settings', () => {
    assert.strictEqual(checksSchema.safeParse({}).success, true);
});

test('schema rejects non-object noDuplicatedFiles settings', () => {
    assert.strictEqual(checksSchema.safeParse({ noDuplicatedFiles: true }).success, false);
});

const validNoDuplicatedFilesSettings = { enabled: true, allowList: ['src/index.ts'] };

createTestCasesForOptionalField({
    schema: checksSchema,
    data: { noDuplicatedFiles: validNoDuplicatedFilesSettings },
    path: 'noDuplicatedFiles',
    expectedFieldType: 'object'
});

createTestCasesForRequiredField({
    schema: checksSchema,
    data: { noDuplicatedFiles: validNoDuplicatedFilesSettings },
    path: 'noDuplicatedFiles.enabled',
    expectedFieldType: 'boolean'
});

createTestCasesForOptionalField({
    schema: checksSchema,
    data: { noDuplicatedFiles: validNoDuplicatedFilesSettings },
    path: 'noDuplicatedFiles.allowList',
    expectedFieldType: 'array'
});

test(
    'no duplicated files settings: validation succeeds with enabled and allow list',
    checkValidationSuccess({
        schema: checksSchema,
        data: { noDuplicatedFiles: { enabled: true, allowList: ['src/index.ts'] } },
        expectedData: { noDuplicatedFiles: { enabled: true, allowList: ['src/index.ts'] } }
    })
);

test(
    'no duplicated files settings: validation fails when enabled is missing',
    checkValidationFailure({
        schema: checksSchema,
        data: { noDuplicatedFiles: { allowList: ['src/index.ts'] } },
        expectedMessages: ['at noDuplicatedFiles.enabled: missing property']
    })
);

test(
    'checks settings: validation succeeds when empty',
    checkValidationSuccess({
        schema: checksSchema,
        data: {},
        expectedData: {}
    })
);

test(
    'checks settings: validation fails when noDuplicatedFiles is not an object',
    checkValidationFailure({
        schema: checksSchema,
        data: { noDuplicatedFiles: true },
        expectedMessages: ['at noDuplicatedFiles: expected object, but got boolean']
    })
);

test(
    'no duplicated files settings: validation fails when an additional property is given',
    checkValidationFailure({
        schema: checksSchema,
        data: { noDuplicatedFiles: { ...validNoDuplicatedFilesSettings, extra: true } },
        expectedMessages: ['at noDuplicatedFiles: unexpected additional property: "extra"']
    })
);
