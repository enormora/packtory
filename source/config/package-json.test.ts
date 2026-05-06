import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { test } from 'mocha';
import { fake } from 'sinon';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { isForbiddenAdditionalPackageJsonAttributeName, packageJsonDependencyFieldNames } from './package-json.ts';
import { additionalPackageJsonAttributesSchema } from './additional-package-json-attributes-schema.ts';
import { mainPackageJsonSchema } from './main-package-json-schema.ts';

test('package.json dependency field names are exposed as runtime constants', () => {
    assert.deepStrictEqual(packageJsonDependencyFieldNames, ['dependencies', 'devDependencies', 'peerDependencies']);
});

test('forbidden additional package.json attribute helper identifies allowed and forbidden keys', () => {
    assert.strictEqual(isForbiddenAdditionalPackageJsonAttributeName('dependencies'), true);
    assert.strictEqual(isForbiddenAdditionalPackageJsonAttributeName('version'), true);
    assert.strictEqual(isForbiddenAdditionalPackageJsonAttributeName('license'), false);
});

test('main package.json schema accepts type module', () => {
    assert.strictEqual(safeParse(mainPackageJsonSchema, { type: 'module' }).success, true);
});

test('main package.json schema rejects type commonjs', () => {
    assert.strictEqual(safeParse(mainPackageJsonSchema, { type: 'commonjs' }).success, false);
});

test('additional package.json attributes schema rejects dependencies', () => {
    assert.strictEqual(safeParse(additionalPackageJsonAttributesSchema, { dependencies: {} }).success, false);
});

test('additional package.json attributes schema accepts license', () => {
    assert.strictEqual(safeParse(additionalPackageJsonAttributesSchema, { license: 'MIT' }).success, true);
});

test(
    'main package.json: validation succeeds for an empty object',
    checkValidationSuccess({
        schema: mainPackageJsonSchema,
        data: {},
        expectedData: {}
    })
);

test(
    'main package.json: validation succeeds when type is given',
    checkValidationSuccess({
        schema: mainPackageJsonSchema,
        data: { type: 'module' },
        expectedData: { type: 'module' }
    })
);

test(
    'main package.json: validation succeeds when dependencies are given',
    checkValidationSuccess({
        schema: mainPackageJsonSchema,
        data: { dependencies: {} },
        expectedData: { dependencies: {} }
    })
);

test(
    'main package.json: validation succeeds when devDependencies are given',
    checkValidationSuccess({
        schema: mainPackageJsonSchema,
        data: { devDependencies: {} },
        expectedData: { devDependencies: {} }
    })
);

test(
    'main package.json: validation succeeds when peerDependencies are given',
    checkValidationSuccess({
        schema: mainPackageJsonSchema,
        data: { peerDependencies: {} },
        expectedData: { peerDependencies: {} }
    })
);

test(
    'main package.json: validation succeeds when additional properties are given',
    checkValidationSuccess({
        schema: mainPackageJsonSchema,
        data: { foo: 'bar' },
        expectedData: {}
    })
);

test(
    'main package.json: validation fails when a non-object is given',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: 'foo',
        expectedMessages: ['expected object, but got string']
    })
);

test(
    'main package.json: validation fails when type is not "module"',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { type: 'foo' },
        expectedMessages: ['at type: invalid literal: expected "module", but got string']
    })
);

test(
    'main package.json: validation fails when type is null',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { type: null },
        expectedMessages: ['at type: invalid literal: expected "module", but got null']
    })
);

test(
    'main package.json: validation fails when dependencies is not an object',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { dependencies: true },
        expectedMessages: ['at dependencies: expected record, but got boolean']
    })
);

test(
    'main package.json: validation fails when dependencies is null',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { dependencies: null },
        expectedMessages: ['at dependencies: expected record, but got null']
    })
);

test(
    'main package.json: validation fails when dependencies contains non-string values',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { dependencies: { foo: 123 } },
        expectedMessages: ['at dependencies.foo: expected string, but got number']
    })
);

test(
    'main package.json: validation fails when peerDependencies is not an object',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { peerDependencies: true },
        expectedMessages: ['at peerDependencies: expected record, but got boolean']
    })
);

test(
    'main package.json: validation fails when peerDependencies is null',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { peerDependencies: null },
        expectedMessages: ['at peerDependencies: expected record, but got null']
    })
);

test(
    'main package.json: validation fails when peerDependencies contains non-string values',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { peerDependencies: { foo: 123 } },
        expectedMessages: ['at peerDependencies.foo: expected string, but got number']
    })
);

test(
    'main package.json: validation fails when devDependencies is not an object',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { devDependencies: true },
        expectedMessages: ['at devDependencies: expected record, but got boolean']
    })
);

test(
    'main package.json: validation fails when devDependencies is null',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { devDependencies: null },
        expectedMessages: ['at devDependencies: expected record, but got null']
    })
);

test(
    'main package.json: validation fails when devDependencies contains non-string values',
    checkValidationFailure({
        schema: mainPackageJsonSchema,
        data: { devDependencies: { foo: 123 } },
        expectedMessages: ['at devDependencies.foo: expected string, but got number']
    })
);

test(
    'additional attributes: validation succeeds for an empty object',
    checkValidationSuccess({
        schema: additionalPackageJsonAttributesSchema,
        data: {},
        expectedData: {}
    })
);

test(
    'additional attributes: validation succeeds for keys that are not forbidden',
    checkValidationSuccess({
        schema: additionalPackageJsonAttributesSchema,
        data: { license: 123, foo: ['bar'], something: { nested: 'works' } },
        expectedData: { license: 123, foo: ['bar'], something: { nested: 'works' } }
    })
);

test(
    'additional attributes: validation fails when a non-object is given',
    checkValidationFailure({
        schema: additionalPackageJsonAttributesSchema,
        data: 'foo',
        expectedMessages: ['expected record, but got string']
    })
);

test(
    'additional attributes: validation fails when dependencies key is given',
    checkValidationFailure({
        schema: additionalPackageJsonAttributesSchema,
        data: { dependencies: {} },
        expectedMessages: ['at dependencies: invalid key']
    })
);

test(
    'additional attributes: validation fails when peerDependencies key is given',
    checkValidationFailure({
        schema: additionalPackageJsonAttributesSchema,
        data: { peerDependencies: {} },
        expectedMessages: ['at peerDependencies: invalid key']
    })
);

test(
    'additional attributes: validation fails when devDependencies key is given',
    checkValidationFailure({
        schema: additionalPackageJsonAttributesSchema,
        data: { devDependencies: {} },
        expectedMessages: ['at devDependencies: invalid key']
    })
);

test(
    'additional attributes: validation fails when main key is given',
    checkValidationFailure({
        schema: additionalPackageJsonAttributesSchema,
        data: { main: 'foo' },
        expectedMessages: ['at main: invalid key']
    })
);

test(
    'additional attributes: validation fails when name key is given',
    checkValidationFailure({
        schema: additionalPackageJsonAttributesSchema,
        data: { name: 'foo' },
        expectedMessages: ['at name: invalid key']
    })
);

test(
    'additional attributes: validation fails when types key is given',
    checkValidationFailure({
        schema: additionalPackageJsonAttributesSchema,
        data: { types: 'foo' },
        expectedMessages: ['at types: invalid key']
    })
);

test(
    'additional attributes: validation fails when type key is given',
    checkValidationFailure({
        schema: additionalPackageJsonAttributesSchema,
        data: { type: 'module' },
        expectedMessages: ['at type: invalid key']
    })
);

test(
    'additional attributes: validation fails when version is given',
    checkValidationFailure({
        schema: additionalPackageJsonAttributesSchema,
        data: { version: '999' },
        expectedMessages: ['at version: invalid key']
    })
);

test('additional attributes: every forbidden key is rejected by the key schema', async () => {
    const schema = additionalPackageJsonAttributesSchema;

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
        const result = safeParse(schema, { [key]: 'value' });
        assert.strictEqual(result.success, false);
        assert.deepStrictEqual(result.error.issues, [`at ${key}: invalid key`]);
    }
});

test(
    'additional attributes: validation fails when forbidden value is given',
    checkValidationFailure({
        schema: additionalPackageJsonAttributesSchema,
        data: { foo: fake() },
        expectedMessages: [
            'at foo: invalid value: expected one of string, number, boolean, null, array or record, but got function'
        ]
    })
);
