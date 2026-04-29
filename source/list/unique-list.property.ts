import assert from 'node:assert';
import fc from 'fast-check';
import { test } from 'mocha';
import { uniqueList } from './unique-list.ts';

test('uniqueList() removes duplicates while preserving the first occurrence of each value', () => {
    fc.assert(
        fc.property(fc.array(fc.string(), { maxLength: 40 }), (values) => {
            const result = uniqueList(values);
            const expected = values.filter((value, index) => {
                return values.indexOf(value) === index;
            });

            assert.deepStrictEqual(result, expected);
        })
    );
});

test('uniqueList() is idempotent', () => {
    fc.assert(
        fc.property(fc.array(fc.string(), { maxLength: 40 }), (values) => {
            const uniqueOnce = uniqueList(values);
            const uniqueTwice = uniqueList(uniqueOnce);

            assert.deepStrictEqual(uniqueTwice, uniqueOnce);
        })
    );
});
