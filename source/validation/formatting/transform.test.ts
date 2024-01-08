import test from 'ava';
import { transformOrFail, string, tuple, transform } from '@effect/schema/Schema';
import { fail, succeed, type } from '@effect/schema/ParseResult';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

const simpleTransform = transform(
    string,
    tuple(string),
    (value) => {
        return [value] as const;
    },
    ([value]) => {
        return value;
    }
);

const failingTransform = transformOrFail(
    string,
    tuple(string),
    (value) => {
        return fail(type(simpleTransform.ast, value));
    },
    ([value]) => {
        return succeed(value);
    }
);

test('formats a failed transformation correctly', checkValidationFailure, {
    schema: failingTransform,
    data: '',
    expectedMessages: ['Expected <anonymous transform schema>; but got string']
});
