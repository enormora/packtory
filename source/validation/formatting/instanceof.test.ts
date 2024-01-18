import test from 'ava';
import { instanceOf } from '@effect/schema/Schema';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- for testing
class Foo {}

test('formats an instanceOf schema correctly', checkValidationFailure, {
    schema: instanceOf(Foo),
    data: 42,
    expectedMessages: ['Expected Foo; but got number']
});
