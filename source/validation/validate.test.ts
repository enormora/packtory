import test from 'ava';
import { string } from '@effect/schema/Schema';
import { Result } from 'true-myth';
import { validateAgainstSchema } from './validate.js';

test('returns the data as Result.ok when the data is valid', (t) => {
    const result = validateAgainstSchema(string, 'foo');
    t.deepEqual(result, Result.ok('foo'));
});

test('returns the issues and a summary as Result.err when the data is invalid', (t) => {
    const result = validateAgainstSchema(string, 42);
    t.deepEqual(
        result,
        Result.err({
            summary: 'Validation failed with 1 issue(s):\n* Expected string; but got number',
            issues: ['Expected string; but got number']
        })
    );
});
