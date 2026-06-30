import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { rootSchema } from './root.ts';

suite('root', function () {
    suite('root schema shape', function () {
        test('schema accepts a root with js only', function () {
            assert.strictEqual(safeParse(rootSchema, { js: 'foo' }).success, true);
        });

        test('schema rejects a root without js', function () {
            assert.strictEqual(safeParse(rootSchema, { declarationFile: 'bar' }).success, false);
        });

        test(
            'validation succeeds when a minimal root is given',
            checkValidationSuccess({
                schema: rootSchema,
                data: {
                    js: 'foo'
                },
                expectedData: {
                    js: 'foo'
                }
            })
        );

        test(
            'validation succeeds when optional declarationFile is given',
            checkValidationSuccess({
                schema: rootSchema,
                data: {
                    js: 'foo',
                    declarationFile: 'bar'
                },
                expectedData: {
                    js: 'foo',
                    declarationFile: 'bar'
                }
            })
        );

        test(
            'validation fails when a non-object value is given',
            checkValidationFailure({
                schema: rootSchema,
                data: 'foo',
                expectedMessages: [ 'expected object, but got string' ]
            })
        );

        test(
            'validation fails when an empty object is given',
            checkValidationFailure({
                schema: rootSchema,
                data: {},
                expectedMessages: [ 'at js: missing property' ]
            })
        );

        test(
            'validation succeeds when declarationFile is undefined',
            checkValidationSuccess({
                schema: rootSchema,
                data: { declarationFile: undefined, js: 'foo' },
                expectedData: { declarationFile: undefined, js: 'foo' }
            })
        );

        test(
            'validation fails when declarationFile is null',
            checkValidationFailure({
                schema: rootSchema,
                data: { declarationFile: null, js: 'foo' },
                expectedMessages: [ 'at declarationFile: expected string, but got null' ]
            })
        );
    });

    suite('root declaration file validation', function () {
        test(
            'validation fails when an additional property is given',
            checkValidationFailure({
                schema: rootSchema,
                data: { js: 'foo', extra: 'bar' },
                expectedMessages: [ 'unexpected additional property: "extra"' ]
            })
        );

        test(
            'validation fails when declarationFile is not a string',
            checkValidationFailure({
                schema: rootSchema,
                data: { declarationFile: 42, js: 'foo' },
                expectedMessages: [ 'at declarationFile: expected string, but got number' ]
            })
        );

        test(
            'validation fails when declarationFile is an empty string',
            checkValidationFailure({
                schema: rootSchema,
                data: { declarationFile: '', js: 'foo' },
                expectedMessages: [ 'at declarationFile: string must contain at least 1 character' ]
            })
        );

        test(
            'validation fails when js is not a string',
            checkValidationFailure({
                schema: rootSchema,
                data: { js: 42 },
                expectedMessages: [ 'at js: expected string, but got number' ]
            })
        );

        test(
            'validation fails when js is undefined',
            checkValidationFailure({
                schema: rootSchema,
                data: { js: undefined },
                expectedMessages: [ 'at js: expected string, but got undefined' ]
            })
        );

        test(
            'validation fails when js is null',
            checkValidationFailure({
                schema: rootSchema,
                data: { js: null },
                expectedMessages: [ 'at js: expected string, but got null' ]
            })
        );

        test(
            'validation fails when js is an empty string',
            checkValidationFailure({
                schema: rootSchema,
                data: { js: '' },
                expectedMessages: [ 'at js: string must contain at least 1 character' ]
            })
        );
    });
});
