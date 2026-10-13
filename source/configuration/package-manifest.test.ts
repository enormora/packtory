import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { isForbiddenAdditionalPackageManifestAttributeName } from './package-manifest.ts';
import { additionalPackageManifestAttributesSchema } from './additional-package-manifest-attributes-schema.ts';
import { mainPackageManifestSchema } from './main-package-manifest-schema.ts';

suite('package-json', function () {
    suite('package json constants and module type', function () {
        test('forbidden additional package.json attribute helper identifies allowed and forbidden keys', function () {
            assert.strictEqual(isForbiddenAdditionalPackageManifestAttributeName('dependencies'), true);
            assert.strictEqual(isForbiddenAdditionalPackageManifestAttributeName('imports'), true);
            assert.strictEqual(isForbiddenAdditionalPackageManifestAttributeName('version'), true);
            assert.strictEqual(isForbiddenAdditionalPackageManifestAttributeName('license'), false);
        });

        test('main package.json schema accepts type module', function () {
            assert.strictEqual(safeParse(mainPackageManifestSchema, { type: 'module' }).success, true);
        });

        test('main package.json schema rejects type commonjs', function () {
            assert.strictEqual(safeParse(mainPackageManifestSchema, { type: 'commonjs' }).success, false);
        });

        test('additional package.json attributes schema rejects dependencies', function () {
            assert.strictEqual(
                safeParse(additionalPackageManifestAttributesSchema, { dependencies: {} }).success,
                false
            );
        });

        test('additional package.json attributes schema accepts license', function () {
            assert.strictEqual(safeParse(additionalPackageManifestAttributesSchema, { license: 'MIT' }).success, true);
        });

        test(
            'main package.json: validation succeeds when type is given',
            checkValidationSuccess({
                schema: mainPackageManifestSchema,
                data: { type: 'module' },
                expectedData: { type: 'module' }
            })
        );

        test(
            'main package.json: validation succeeds when type and dependencies are given',
            checkValidationSuccess({
                schema: mainPackageManifestSchema,
                data: { type: 'module', dependencies: {} },
                expectedData: { type: 'module', dependencies: {} }
            })
        );
    });

    suite('package json dependency fields', function () {
        test(
            'main package.json: validation succeeds when type and devDependencies are given',
            checkValidationSuccess({
                schema: mainPackageManifestSchema,
                data: { type: 'module', devDependencies: {} },
                expectedData: { type: 'module', devDependencies: {} }
            })
        );

        test(
            'main package.json: validation succeeds when type and peerDependencies are given',
            checkValidationSuccess({
                schema: mainPackageManifestSchema,
                data: { type: 'module', peerDependencies: {} },
                expectedData: { type: 'module', peerDependencies: {} }
            })
        );

        test(
            'main package.json: validation succeeds when imports are given',
            checkValidationSuccess({
                schema: mainPackageManifestSchema,
                data: { type: 'module', imports: { '#foo': './source/foo.js' } },
                expectedData: { type: 'module', imports: { '#foo': './source/foo.js' } }
            })
        );

        test(
            'main package.json: validation succeeds when additional properties are given',
            checkValidationSuccess({
                schema: mainPackageManifestSchema,
                data: { type: 'module', foo: 'bar' },
                expectedData: { type: 'module' }
            })
        );

        test(
            'main package.json: validation fails when imports is not an object',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'module', imports: true },
                expectedMessages: [ 'at imports: expected record, but got boolean' ]
            })
        );

        test(
            'main package.json: validation fails when a non-object is given',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: 'foo',
                expectedMessages: [ 'expected object, but got string' ]
            })
        );

        test(
            'main package.json: validation fails when type is missing',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: {},
                expectedMessages: [ 'at type: missing property' ]
            })
        );

        test(
            'main package.json: validation fails when type is not "module"',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'foo' },
                expectedMessages: [ 'at type: invalid literal: expected "module", but got string' ]
            })
        );
    });

    suite('package json metadata fields', function () {
        test(
            'main package.json: validation fails when type is null',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: null },
                expectedMessages: [ 'at type: invalid literal: expected "module", but got null' ]
            })
        );

        test(
            'main package.json: validation fails when dependencies is not an object',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'module', dependencies: true },
                expectedMessages: [ 'at dependencies: expected record, but got boolean' ]
            })
        );

        test(
            'main package.json: validation fails when dependencies is null',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'module', dependencies: null },
                expectedMessages: [ 'at dependencies: expected record, but got null' ]
            })
        );

        test(
            'main package.json: validation fails when dependencies contains non-string values',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'module', dependencies: { foo: 123 } },
                expectedMessages: [ 'at dependencies.foo: expected string, but got number' ]
            })
        );

        test(
            'main package.json: validation fails when peerDependencies is not an object',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'module', peerDependencies: true },
                expectedMessages: [ 'at peerDependencies: expected record, but got boolean' ]
            })
        );

        test(
            'main package.json: validation fails when peerDependencies is null',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'module', peerDependencies: null },
                expectedMessages: [ 'at peerDependencies: expected record, but got null' ]
            })
        );

        test(
            'main package.json: validation fails when peerDependencies contains non-string values',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'module', peerDependencies: { foo: 123 } },
                expectedMessages: [ 'at peerDependencies.foo: expected string, but got number' ]
            })
        );

        test(
            'main package.json: validation fails when devDependencies is not an object',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'module', devDependencies: true },
                expectedMessages: [ 'at devDependencies: expected record, but got boolean' ]
            })
        );
    });

    suite('package json additional attributes', function () {
        test(
            'main package.json: validation fails when devDependencies is null',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'module', devDependencies: null },
                expectedMessages: [ 'at devDependencies: expected record, but got null' ]
            })
        );

        test(
            'main package.json: validation fails when devDependencies contains non-string values',
            checkValidationFailure({
                schema: mainPackageManifestSchema,
                data: { type: 'module', devDependencies: { foo: 123 } },
                expectedMessages: [ 'at devDependencies.foo: expected string, but got number' ]
            })
        );

        test(
            'additional attributes: validation succeeds for an empty object',
            checkValidationSuccess({
                schema: additionalPackageManifestAttributesSchema,
                data: {},
                expectedData: {}
            })
        );

        test(
            'additional attributes: validation succeeds for keys that are not forbidden',
            checkValidationSuccess({
                schema: additionalPackageManifestAttributesSchema,
                data: { license: 123, foo: [ 'bar' ], something: { nested: 'works' } },
                expectedData: { license: 123, foo: [ 'bar' ], something: { nested: 'works' } }
            })
        );

        test(
            'additional attributes: validation fails when a non-object is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: 'foo',
                expectedMessages: [ 'expected record, but got string' ]
            })
        );

        test(
            'additional attributes: validation fails when dependencies key is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: { dependencies: {} },
                expectedMessages: [ 'at dependencies: invalid key' ]
            })
        );

        test(
            'additional attributes: validation fails when peerDependencies key is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: { peerDependencies: {} },
                expectedMessages: [ 'at peerDependencies: invalid key' ]
            })
        );

        test(
            'additional attributes: validation fails when devDependencies key is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: { devDependencies: {} },
                expectedMessages: [ 'at devDependencies: invalid key' ]
            })
        );
    });

    suite('forbidden package json attributes', function () {
        test(
            'additional attributes: validation fails when imports key is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: { imports: { '#foo': './foo.js' } },
                expectedMessages: [ 'at imports: invalid key' ]
            })
        );

        test(
            'additional attributes: validation fails when main key is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: { main: 'foo' },
                expectedMessages: [ 'at main: invalid key' ]
            })
        );

        test(
            'additional attributes: validation fails when name key is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: { name: 'foo' },
                expectedMessages: [ 'at name: invalid key' ]
            })
        );

        test(
            'additional attributes: validation fails when types key is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: { types: 'foo' },
                expectedMessages: [ 'at types: invalid key' ]
            })
        );

        test(
            'additional attributes: validation fails when type key is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: { type: 'module' },
                expectedMessages: [ 'at type: invalid key' ]
            })
        );

        test(
            'additional attributes: validation fails when version is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: { version: '999' },
                expectedMessages: [ 'at version: invalid key' ]
            })
        );

        test('additional attributes: every forbidden key is rejected by the key schema', async function () {
            const schema = additionalPackageManifestAttributesSchema;

            for (
                const key of [
                    'dependencies',
                    'peerDependencies',
                    'devDependencies',
                    'imports',
                    'main',
                    'name',
                    'types',
                    'type',
                    'version'
                ]
            ) {
                const result = safeParse(schema, { [key]: 'value' });
                assertDeepSubset(result, {
                    success: false,
                    error: {
                        issues: [ `at ${key}: invalid key` ]
                    }
                });
            }
        });

        test(
            'additional attributes: validation fails when forbidden value is given',
            checkValidationFailure({
                schema: additionalPackageManifestAttributesSchema,
                data: { foo: fake() },
                expectedMessages: [
                    'at foo: invalid value: expected one of string, number, boolean, null, array or record, but got function'
                ]
            })
        );
    });
});
