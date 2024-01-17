import test from 'ava';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.js';
import { additionalPackageJsonAttributesSchema, mainPackageJsonSchema } from './package-json.js';

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
    expectedMessages: ['Expected object; but got string']
});

test('main package.json: validation fails when type is not "module"', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { type: 'foo' },
    expectedMessages: ['At type: expected "module"; but got string']
});

test('main package.json: validation fails when dependencies is not an object', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { dependencies: true },
    expectedMessages: ['At dependencies: expected object; but got boolean']
});

test('main package.json: validation fails when dependencies contains non-string values', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { dependencies: { foo: 123 } },
    expectedMessages: ['At dependencies.foo: expected string; but got number']
});

test('main package.json: validation fails when devDependencies is not an object', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { devDependencies: true },
    expectedMessages: ['At devDependencies: expected object; but got boolean']
});

test('main package.json: validation fails when devDependencies contains non-string values', checkValidationFailure, {
    schema: mainPackageJsonSchema,
    data: { devDependencies: { foo: 123 } },
    expectedMessages: ['At devDependencies.foo: expected string; but got number']
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
    expectedMessages: ['Expected object; but got string']
});

test('additional attributes: validation fails when dependencies key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { dependencies: {} },
    expectedMessages: ['At dependencies: unexpected extra key or index']
});

test('additional attributes: validation fails when peerDependencies key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { peerDependencies: {} },
    expectedMessages: ['At peerDependencies: unexpected extra key or index']
});

test('additional attributes: validation fails when main key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { main: 'foo' },
    expectedMessages: ['At main: unexpected extra key or index']
});

test('additional attributes: validation fails when name key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { name: 'foo' },
    expectedMessages: ['At name: unexpected extra key or index']
});

test('additional attributes: validation fails when types key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { types: 'foo' },
    expectedMessages: ['At types: unexpected extra key or index']
});

test('additional attributes: validation fails when type key is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { type: 'module' },
    expectedMessages: ['At type: unexpected extra key or index']
});

test('additional attributes: validation fails when version is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { version: '999' },
    expectedMessages: ['At version: unexpected extra key or index']
});

test('additional attributes: validation fails when forbidden value is given', checkValidationFailure, {
    schema: additionalPackageJsonAttributesSchema,
    data: { foo: () => {} },
    expectedMessages: ['At foo: expected one of object, array, string, number, boolean or null; but got function']
});
