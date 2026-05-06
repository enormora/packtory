import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { additionalPackageJsonAttributesSchema } from './additional-package-json-attributes-schema.ts';

test('additional attributes schema accepts allowed keys', () => {
    assert.strictEqual(safeParse(additionalPackageJsonAttributesSchema, { license: 'MIT' }).success, true);
});

test('additional attributes schema rejects forbidden object keys', () => {
    assert.strictEqual(safeParse(additionalPackageJsonAttributesSchema, { dependencies: {} }).success, false);
});

test(
    'additional package json attributes schema: validation succeeds for allowed keys',
    checkValidationSuccess({
        schema: additionalPackageJsonAttributesSchema,
        data: { license: 'MIT', exports: { '.': './index.js' } },
        expectedData: { license: 'MIT', exports: { '.': './index.js' } }
    })
);

for (const key of ['dependencies', 'peerDependencies', 'devDependencies', 'main', 'name', 'types', 'type', 'version']) {
    test(
        `additional package json attributes schema: validation fails for forbidden key ${key}`,
        checkValidationFailure({
            schema: additionalPackageJsonAttributesSchema,
            data: { [key]: 'value' },
            expectedMessages: [`at ${key}: invalid key`]
        })
    );
}

test('additional package json attributes schema: every forbidden key is rejected', () => {
    for (const key of [
        'dependencies',
        'peerDependencies',
        'devDependencies',
        'main',
        'name',
        'types',
        'type',
        'version'
    ]) {
        const result = safeParse(additionalPackageJsonAttributesSchema, { [key]: 'value' });
        assert.strictEqual(result.success, false);
    }
});
