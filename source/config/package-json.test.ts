import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { additionalPackageJsonAttributesSchema, mainPackageJsonSchema } from './package-json.ts';

test('main package.json: validation succeeds for an empty object', checkValidationSuccess, {
    schema: mainPackageJsonSchema,
    data: {}
});

test('main package.json: validation succeeds when type is given', checkValidationSuccess, {
    schema: mainPackageJsonSchema,
    data: { type: 'module' }
});

test('main package.json: validation succeeds when dependencies are given', checkValidationSuccess, {
    schema: mainPackageJsonSchema,
    data: { dependencies: {} }
});

test('main package.json: validation succeeds when devDependencies are given', checkValidationSuccess, {
    schema: mainPackageJsonSchema,
    data: { devDependencies: {} }
});

test('main package.json: validation succeeds when additional properties are given', checkValidationSuccess, {
    schema: mainPackageJsonSchema,
    data: { foo: 'bar' }
});

test('main package.json: validation fails when a non-object is given', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: 'foo',
    expectedMessages: ['expected object, but got string']
});

test('main package.json: validation fails when type is not "module"', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { type: 'foo' },
    expectedMessages: ['at type: invalid literal: expected "module", but got string']
});

test('main package.json: validation fails when dependencies is not an object', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { dependencies: true },
    expectedMessages: ['at dependencies: expected record, but got boolean']
});

test('main package.json: validation fails when dependencies contains non-string values', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { dependencies: { foo: 123 } },
    expectedMessages: ['at dependencies.foo: expected string, but got number']
});

test('main package.json: validation fails when peerDependencies is not an object', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { peerDependencies: true },
    expectedMessages: ['at peerDependencies: expected record, but got boolean']
});

test('main package.json: validation fails when peerDependencies contains non-string values', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { peerDependencies: { foo: 123 } },
    expectedMessages: ['at peerDependencies.foo: expected string, but got number']
});

test('main package.json: validation fails when devDependencies is not an object', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { devDependencies: true },
    expectedMessages: ['at devDependencies: expected record, but got boolean']
});

test('main package.json: validation fails when devDependencies contains non-string values', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { devDependencies: { foo: 123 } },
    expectedMessages: ['at devDependencies.foo: expected string, but got number']
});

test('additional attributes: validation succeeds for an empty object', checkValidationSuccess, {
    schema: additionalPackageJsonAttributesSchema,
    data: {}
});

test('additional attributes: validation succeeds for keys that are not forbidden', checkValidationSuccess, {
    schema: additionalPackageJsonAttributesSchema,
    data: { license: 123, foo: ['bar'], something: { nested: 'works' } }
});

test('additional attributes: validation fails when a non-object is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: 'foo',
    expectedMessages: ['expected record, but got string']
});

test('additional attributes: validation fails when dependencies key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { dependencies: {} },
    expectedMessages: ['at dependencies: invalid key']
});

test('additional attributes: validation fails when peerDependencies key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { peerDependencies: {} },
    expectedMessages: ['at peerDependencies: invalid key']
});

test('additional attributes: validation fails when devDependencies key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { devDependencies: {} },
    expectedMessages: ['at devDependencies: invalid key']
});

test('additional attributes: validation fails when main key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { main: 'foo' },
    expectedMessages: ['at main: invalid key']
});

test('additional attributes: validation fails when name key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { name: 'foo' },
    expectedMessages: ['at name: invalid key']
});

test('additional attributes: validation fails when types key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { types: 'foo' },
    expectedMessages: ['at types: invalid key']
});

test('additional attributes: validation fails when type key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { type: 'module' },
    expectedMessages: ['at type: invalid key']
});

test('additional attributes: validation fails when version is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { version: '999' },
    expectedMessages: ['at version: invalid key']
});

test('additional attributes: validation fails when forbidden value is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- ok in this case
    data: { foo: () => {} },
    expectedMessages: [
        'at foo: invalid value: expected one of string, number, boolean, null, array or record, but got function'
    ]
});
