import assert from 'node:assert';
import { suite, test } from 'mocha';
import { contentDigest, valueFingerprint } from './value-fingerprint.ts';

suite('value fingerprints', function () {
    test('preserves object ordering and collection contents', function () {
        assert.notStrictEqual(
            valueFingerprint({ default: 'first', import: 'second' }),
            valueFingerprint({ import: 'second', default: 'first' })
        );
        assert.notStrictEqual(
            valueFingerprint(new Map([ [ 'name', 'first' ] ])),
            valueFingerprint(new Map([ [ 'name', 'second' ] ]))
        );
        assert.notStrictEqual(valueFingerprint(new Set([ 'first' ])), valueFingerprint(new Set([ 'second' ])));
        assert.notStrictEqual(contentDigest('source'), contentDigest('change'));
    });
});
