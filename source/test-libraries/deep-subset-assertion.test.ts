import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { assertDeepSubset } from './deep-subset-assertion.ts';

suite('observed subsets', function () {
    test('observes spy arguments through full field names and rejects wrong argument values', function () {
        const dependency = fake(function (value: string) {
            return value.toUpperCase();
        });
        dependency('sample');
        assertDeepSubset(dependency, {
            firstCall: { arguments: [ 'sample' ], firstArgument: 'sample', lastArgument: 'sample' }
        });
        assert.throws(function () {
            assertDeepSubset(dependency, { firstCall: { arguments: [ 'other' ] } });
        }, assert.AssertionError);
    });

    test('keeps ordinary object fields distinct from library call fields', function () {
        assert.throws(function () {
            assertDeepSubset({ args: [ 'sample' ] }, { arguments: [ 'sample' ] });
        }, assert.AssertionError);
    });
});
