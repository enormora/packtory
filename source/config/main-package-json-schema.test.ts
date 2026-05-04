import assert from 'node:assert';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { mainPackageJsonSchema } from './main-package-json-schema.ts';

test('schema accepts type module', () => {
    assert.strictEqual(mainPackageJsonSchema.safeParse({ type: 'module' }).success, true);
});

test('schema rejects type commonjs', () => {
    assert.strictEqual(mainPackageJsonSchema.safeParse({ type: 'commonjs' }).success, false);
});

test(
    'main package json schema: validation succeeds for an empty object',
    checkValidationSuccess({
        schema: mainPackageJsonSchema,
        data: {},
        expectedData: {}
    })
);

test(
    'main package json schema: validation succeeds for module type',
    checkValidationSuccess({
        schema: mainPackageJsonSchema,
        data: { type: 'module' },
        expectedData: { type: 'module' }
    })
);

test(
    'main package json schema: validation fails when type is not module',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { type: 'commonjs' },
        expectedMessages: ['at type: invalid literal: expected "module", but got string']
    })
);

test(
    'main package json schema: validation fails when dependencies contain non-string values',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { dependencies: { foo: 123 } },
        expectedMessages: ['at dependencies.foo: expected string, but got number']
    })
);
