import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { entryPointSchema } from './entry-point.ts';

test('schema accepts an entry point with js only', () => {
    assert.strictEqual(safeParse(entryPointSchema, { js: 'foo' }).success, true);
});

test('schema rejects an entry point without js', () => {
    assert.strictEqual(safeParse(entryPointSchema, { declarationFile: 'bar' }).success, false);
});

test(
    'validation succeeds when a minimal entryPoint is given',
    checkValidationSuccess({
        schema: entryPointSchema,
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
        schema: entryPointSchema,
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
        schema: entryPointSchema,
        data: 'foo',
        expectedMessages: ['expected object, but got string']
    })
);

test(
    'validation fails when an empty object is given',
    checkValidationFailure({
        schema: entryPointSchema,
        data: {},
        expectedMessages: ['at js: missing property']
    })
);

test(
    'validation succeeds when declarationFile is undefined',
    checkValidationSuccess({
        schema: entryPointSchema,
        data: { declarationFile: undefined, js: 'foo' },
        expectedData: { declarationFile: undefined, js: 'foo' }
    })
);

test(
    'validation fails when declarationFile is null',
    checkValidationFailure({
        schema: entryPointSchema,
        data: { declarationFile: null, js: 'foo' },
        expectedMessages: ['at declarationFile: expected string, but got null']
    })
);

test(
    'validation fails when an additional property is given',
    checkValidationFailure({
        schema: entryPointSchema,
        data: { js: 'foo', extra: 'bar' },
        expectedMessages: ['unexpected additional property: "extra"']
    })
);

test(
    'validation fails when declarationFile is not a string',
    checkValidationFailure({
        schema: entryPointSchema,
        data: { declarationFile: 42, js: 'foo' },
        expectedMessages: ['at declarationFile: expected string, but got number']
    })
);

test(
    'validation fails when declarationFile is an empty string',
    checkValidationFailure({
        schema: entryPointSchema,
        data: { declarationFile: '', js: 'foo' },
        expectedMessages: ['at declarationFile: string must contain at least 1 character']
    })
);

test(
    'validation fails when js is not a string',
    checkValidationFailure({
        schema: entryPointSchema,
        data: { js: 42 },
        expectedMessages: ['at js: expected string, but got number']
    })
);

test(
    'validation fails when js is undefined',
    checkValidationFailure({
        schema: entryPointSchema,
        data: { js: undefined },
        expectedMessages: ['at js: expected string, but got undefined']
    })
);

test(
    'validation fails when js is null',
    checkValidationFailure({
        schema: entryPointSchema,
        data: { js: null },
        expectedMessages: ['at js: expected string, but got null']
    })
);

test(
    'validation fails when js is an empty string',
    checkValidationFailure({
        schema: entryPointSchema,
        data: { js: '' },
        expectedMessages: ['at js: string must contain at least 1 character']
    })
);
