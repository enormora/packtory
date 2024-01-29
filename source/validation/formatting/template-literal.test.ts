import test from 'ava';
import { templateLiteral, literal, number, string } from '@effect/schema/Schema';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

test('formats a template literal schema correctly', checkValidationFailure, {
    schema: templateLiteral(number, literal('a'), string),
    data: 'foo',
    // eslint-disable-next-line no-template-curly-in-string -- for testing
    expectedMessages: ['Expected ${number}a${string}; but got string']
});
