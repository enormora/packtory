import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { test } from 'mocha';
import {
    checkValidationFailure,
    checkValidationSuccess,
    createTestCasesForOptionalField,
    createTestCasesForRequiredField
} from '../test-libraries/verify-schema-validation.ts';
import { checksPerPackageSchema, checksSchema } from './checks-schema.ts';

test('schema accepts valid noDuplicatedFiles settings at the top level', () => {
    assert.strictEqual(safeParse(checksSchema, { noDuplicatedFiles: { enabled: true } }).success, true);
});

test('top-level schema rejects an allowList field on noDuplicatedFiles', () => {
    assert.strictEqual(
        safeParse(checksSchema, { noDuplicatedFiles: { enabled: true, allowList: ['src/index.ts'] } }).success,
        false
    );
});

test('schema rejects noDuplicatedFiles settings without enabled', () => {
    assert.strictEqual(safeParse(checksSchema, { noDuplicatedFiles: {} }).success, false);
});

test('schema accepts empty checks settings', () => {
    assert.strictEqual(safeParse(checksSchema, {}).success, true);
});

test('schema rejects non-object noDuplicatedFiles settings', () => {
    assert.strictEqual(safeParse(checksSchema, { noDuplicatedFiles: true }).success, false);
});

const validNoDuplicatedFilesGlobal = { enabled: true };

createTestCasesForOptionalField({
    schema: checksSchema,
    data: { noDuplicatedFiles: validNoDuplicatedFilesGlobal },
    path: 'noDuplicatedFiles',
    expectedFieldType: 'object'
});

createTestCasesForRequiredField({
    schema: checksSchema,
    data: { noDuplicatedFiles: validNoDuplicatedFilesGlobal },
    path: 'noDuplicatedFiles.enabled',
    expectedFieldType: 'boolean'
});

test(
    'no duplicated files settings: validation succeeds with enabled at the top level',
    checkValidationSuccess({
        schema: checksSchema,
        data: { noDuplicatedFiles: { enabled: true } },
        expectedData: { noDuplicatedFiles: { enabled: true } }
    })
);

test(
    'no duplicated files settings: validation fails when enabled is missing',
    checkValidationFailure({
        schema: checksSchema,
        data: { noDuplicatedFiles: {} },
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
        data: { noDuplicatedFiles: { ...validNoDuplicatedFilesGlobal, extra: true } },
        expectedMessages: ['at noDuplicatedFiles: unexpected additional property: "extra"']
    })
);

test('per-package schema accepts an empty noDuplicatedFiles object', () => {
    assert.strictEqual(safeParse(checksPerPackageSchema, { noDuplicatedFiles: {} }).success, true);
});

test('per-package schema accepts an allowList of file paths', () => {
    assert.strictEqual(
        safeParse(checksPerPackageSchema, { noDuplicatedFiles: { allowList: ['src/shared/util.ts'] } }).success,
        true
    );
});

test('per-package schema rejects an enabled flag', () => {
    assert.strictEqual(safeParse(checksPerPackageSchema, { noDuplicatedFiles: { enabled: true } }).success, false);
});

test('per-package schema rejects an empty string in the allowList', () => {
    assert.strictEqual(safeParse(checksPerPackageSchema, { noDuplicatedFiles: { allowList: [''] } }).success, false);
});

test(
    'per-package: validation fails when allowList contains an empty path',
    checkValidationFailure({
        schema: checksPerPackageSchema,
        data: { noDuplicatedFiles: { allowList: [''] } },
        expectedMessages: ['at noDuplicatedFiles.allowList[0]: string must contain at least 1 character']
    })
);

test(
    'per-package: validation fails when an unknown extra property is given',
    checkValidationFailure({
        schema: checksPerPackageSchema,
        data: { noDuplicatedFiles: { allowList: ['LICENSE'], extra: true } },
        expectedMessages: ['at noDuplicatedFiles: unexpected additional property: "extra"']
    })
);

test('top-level schema accepts requiredFiles with enabled and a files list', () => {
    assert.strictEqual(safeParse(checksSchema, { requiredFiles: { enabled: true, files: ['LICENSE'] } }).success, true);
});

test('top-level schema rejects requiredFiles without enabled', () => {
    assert.strictEqual(safeParse(checksSchema, { requiredFiles: { files: ['LICENSE'] } }).success, false);
});

test('top-level schema rejects an empty path in requiredFiles.files', () => {
    assert.strictEqual(safeParse(checksSchema, { requiredFiles: { enabled: true, files: [''] } }).success, false);
});

test('per-package schema accepts requiredFiles with a files list', () => {
    assert.strictEqual(safeParse(checksPerPackageSchema, { requiredFiles: { files: ['LICENSE'] } }).success, true);
});

test('per-package schema rejects an enabled flag on requiredFiles', () => {
    assert.strictEqual(safeParse(checksPerPackageSchema, { requiredFiles: { enabled: true } }).success, false);
});

test('top-level schema accepts maxBundleSize with enabled and a bytes threshold', () => {
    assert.strictEqual(safeParse(checksSchema, { maxBundleSize: { enabled: true, bytes: 1024 } }).success, true);
});

test('top-level schema accepts maxBundleSize without bytes', () => {
    assert.strictEqual(safeParse(checksSchema, { maxBundleSize: { enabled: true } }).success, true);
});

test('top-level schema rejects a negative byte threshold', () => {
    assert.strictEqual(safeParse(checksSchema, { maxBundleSize: { enabled: true, bytes: -1 } }).success, false);
});

test('top-level schema rejects a non-integer byte threshold', () => {
    assert.strictEqual(safeParse(checksSchema, { maxBundleSize: { enabled: true, bytes: 1.5 } }).success, false);
});

test('per-package schema accepts a maxBundleSize override', () => {
    assert.strictEqual(safeParse(checksPerPackageSchema, { maxBundleSize: { bytes: 2048 } }).success, true);
});

test('per-package schema rejects an enabled flag on maxBundleSize', () => {
    assert.strictEqual(safeParse(checksPerPackageSchema, { maxBundleSize: { enabled: true } }).success, false);
});

test('top-level schema accepts noUnusedBundleDependencies with enabled', () => {
    assert.strictEqual(safeParse(checksSchema, { noUnusedBundleDependencies: { enabled: true } }).success, true);
});

test('top-level schema rejects noUnusedBundleDependencies without enabled', () => {
    assert.strictEqual(safeParse(checksSchema, { noUnusedBundleDependencies: {} }).success, false);
});

test('per-package schema accepts an empty noUnusedBundleDependencies object', () => {
    assert.strictEqual(safeParse(checksPerPackageSchema, { noUnusedBundleDependencies: {} }).success, true);
});

test('per-package schema rejects any field on noUnusedBundleDependencies', () => {
    assert.strictEqual(
        safeParse(checksPerPackageSchema, { noUnusedBundleDependencies: { enabled: true } }).success,
        false
    );
});
