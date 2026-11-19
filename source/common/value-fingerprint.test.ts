import assert from 'node:assert';
import { suite, test } from 'mocha';
import { contentDigest, valueFingerprint } from './value-fingerprint.ts';

suite('value fingerprints', function () {
    test('preserves identities across equivalent array constructions and cloning', function () {
        const original = { empty: [], values: [ 1, 2 ], nested: new Map([ [ 'values', [ 3, 4 ] ] ]) };
        const rebuilt = {
            empty: [ 1 ].flatMap(function () {
                return [];
            }),
            values: [ 1, 2 ].flatMap(function (value) {
                return value;
            }),
            nested: new Map([ [ 'values', Array.from([ 3, 4 ]) ] ])
        };
        assert.strictEqual(valueFingerprint(original), valueFingerprint(rebuilt));
        assert.strictEqual(valueFingerprint(original), valueFingerprint(structuredClone(original)));
    });

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
