import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
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
        safeParse(checksSchema, { noDuplicatedFiles: { enabled: true, allowList: ['src/index.ts'] } }).success,
        true
    );
});

test('schema rejects noDuplicatedFiles settings without enabled', () => {
    assert.strictEqual(safeParse(checksSchema, { noDuplicatedFiles: { allowList: ['src/index.ts'] } }).success, false);
});

test('schema accepts empty checks settings', () => {
    assert.strictEqual(safeParse(checksSchema, {}).success, true);
});

test('schema rejects non-object noDuplicatedFiles settings', () => {
    assert.strictEqual(safeParse(checksSchema, { noDuplicatedFiles: true }).success, false);
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

test(
    'allow list: validation succeeds with a scoped entry naming two packages',
    checkValidationSuccess({
        schema: checksSchema,
        data: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'src/shared/util.ts', packages: ['a', 'b'] }]
            }
        },
        expectedData: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'src/shared/util.ts', packages: ['a', 'b'] }]
            }
        }
    })
);

test(
    'allow list: validation succeeds with a mix of plain string and scoped entries',
    checkValidationSuccess({
        schema: checksSchema,
        data: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: ['LICENSE', { filePath: 'src/shared/util.ts', packages: ['a', 'b'] }]
            }
        },
        expectedData: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: ['LICENSE', { filePath: 'src/shared/util.ts', packages: ['a', 'b'] }]
            }
        }
    })
);

test(
    'allow list: validation fails when a scoped entry has fewer than two packages',
    checkValidationFailure({
        schema: checksSchema,
        data: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'src/shared/util.ts', packages: ['a'] }]
            }
        },
        expectedMessages: ['at noDuplicatedFiles.allowList[0].packages: array must contain at least 2 elements']
    })
);

test(
    'allow list: validation fails when a scoped entry omits filePath',
    checkValidationFailure({
        schema: checksSchema,
        data: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ packages: ['a', 'b'] }]
            }
        },
        expectedMessages: ['at noDuplicatedFiles.allowList[0]: invalid value doesn’t match expected union']
    })
);

test(
    'allow list: validation fails when a scoped entry has an unknown extra property',
    checkValidationFailure({
        schema: checksSchema,
        data: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'src/shared/util.ts', packages: ['a', 'b'], extra: true }]
            }
        },
        expectedMessages: ['at noDuplicatedFiles.allowList[0]: invalid value doesn’t match expected union']
    })
);
