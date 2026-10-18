import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { mainPackageManifestSchema } from './main-package-manifest-schema.ts';

suite('main-package-json-schema', function () {
    test('schema accepts type module', function () {
        assert.strictEqual(safeParse(mainPackageManifestSchema, { type: 'module' }).success, true);
    });

    test('schema rejects type commonjs', function () {
        assert.strictEqual(safeParse(mainPackageManifestSchema, { type: 'commonjs' }).success, false);
    });

    test(
        'main package json schema: validation succeeds for module type',
        checkValidationSuccess({
            schema: mainPackageManifestSchema,
            data: { type: 'module' },
            expectedData: { type: 'module' }
        })
    );

    test(
        'main package json schema: validation succeeds when imports is an object',
        checkValidationSuccess({
            schema: mainPackageManifestSchema,
            data: {
                type: 'module',
                imports: { '#foo': './source/foo.js', '#bar/*': { default: './source/bar/*.js' } }
            },
            expectedData: {
                type: 'module',
                imports: { '#foo': './source/foo.js', '#bar/*': { default: './source/bar/*.js' } }
            }
        })
    );

    test(
        'main package json schema: validation fails when type is missing',
        checkValidationFailure({
            schema: mainPackageManifestSchema,
            data: {},
            expectedMessages: [ 'at type: missing property' ]
        })
    );

    test(
        'main package json schema: validation fails when type is not module',
        checkValidationFailure({
            schema: mainPackageManifestSchema,
            data: { type: 'commonjs' },
            expectedMessages: [ 'at type: invalid literal: expected "module", but got string' ]
        })
    );

    test(
        'main package json schema: validation fails when dependencies contain non-string values',
        checkValidationFailure({
            schema: mainPackageManifestSchema,
            data: { type: 'module', dependencies: { foo: 123 } },
            expectedMessages: [ 'at dependencies.foo: expected string, but got number' ]
        })
    );

    test(
        'main package json schema: validation fails when imports is not an object',
        checkValidationFailure({
            schema: mainPackageManifestSchema,
            data: { type: 'module', imports: true },
            expectedMessages: [ 'at imports: expected record, but got boolean' ]
        })
    );
});
