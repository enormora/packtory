import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { rootSchema } from './root.ts';

suite('root', function () {
    suite('root schema shape', function () {
        test('accepts JSON and declaration-only roots', function () {
            assert.strictEqual(safeParse(rootSchema, { json: 'config.json' }).success, true);
            for (const extension of [ '.d.ts', '.d.mts', '.d.cts' ]) {
                assert.strictEqual(safeParse(rootSchema, { declarationFile: `index${extension}` }).success, true);
            }
        });

        test('rejects ambiguous roots and non-JSON assets declared as JSON', function () {
            const invalidRoots = [
                { json: 'code.js' },
                { javaScript: 'code.js', json: 'data.json' },
                { declarationFile: 'index.d.ts', json: 'data.json' }
            ];
            for (const root of invalidRoots) {
                assert.strictEqual(safeParse(rootSchema, root).success, false);
            }
        });

        test('schema accepts a root with js only', function () {
            assert.strictEqual(safeParse(rootSchema, { javaScript: 'foo' }).success, true);
        });

        test('schema rejects a declaration-only root without a declaration extension', function () {
            assert.strictEqual(safeParse(rootSchema, { declarationFile: 'bar' }).success, false);
        });

        test(
            'validation succeeds when a minimal root is given',
            checkValidationSuccess({
                schema: rootSchema,
                data: {
                    javaScript: 'foo'
                },
                expectedData: {
                    javaScript: 'foo'
                }
            })
        );

        test(
            'validation succeeds when optional declarationFile is given',
            checkValidationSuccess({
                schema: rootSchema,
                data: {
                    javaScript: 'foo',
                    declarationFile: 'bar'
                },
                expectedData: {
                    javaScript: 'foo',
                    declarationFile: 'bar'
                }
            })
        );

        test(
            'validation fails when a non-object value is given',
            checkValidationFailure({
                schema: rootSchema,
                data: 'foo',
                expectedMessages: [ 'invalid value: expected object, but got string' ]
            })
        );

        test(
            'validation fails when an empty object is given',
            checkValidationFailure({
                schema: rootSchema,
                data: {},
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation succeeds when declarationFile is undefined',
            checkValidationSuccess({
                schema: rootSchema,
                data: { declarationFile: undefined, javaScript: 'foo' },
                expectedData: { declarationFile: undefined, javaScript: 'foo' }
            })
        );

        test(
            'validation fails when declarationFile is null',
            checkValidationFailure({
                schema: rootSchema,
                data: { declarationFile: null, javaScript: 'foo' },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );
    });

    suite('root declaration file validation', function () {
        test(
            'validation fails when an additional property is given',
            checkValidationFailure({
                schema: rootSchema,
                data: { javaScript: 'foo', extra: 'bar' },
                expectedMessages: [ 'unexpected additional property: "extra"' ]
            })
        );

        test(
            'validation fails when declarationFile is not a string',
            checkValidationFailure({
                schema: rootSchema,
                data: { declarationFile: 42, javaScript: 'foo' },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when declarationFile is an empty string',
            checkValidationFailure({
                schema: rootSchema,
                data: { declarationFile: '', javaScript: 'foo' },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when js is not a string',
            checkValidationFailure({
                schema: rootSchema,
                data: { javaScript: 42 },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when js is undefined',
            checkValidationFailure({
                schema: rootSchema,
                data: { javaScript: undefined },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when js is null',
            checkValidationFailure({
                schema: rootSchema,
                data: { javaScript: null },
                expectedMessages: [ 'invalid value doesn’t match expected union' ]
            })
        );

        test(
            'validation fails when js is an empty string',
            checkValidationFailure({
                schema: rootSchema,
                data: { javaScript: '' },
                expectedMessages: [ 'at javaScript: string must contain at least 1 character' ]
            })
        );
    });
});
