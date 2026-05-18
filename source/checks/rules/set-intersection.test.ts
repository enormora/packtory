import assert from 'node:assert';
import { test } from 'mocha';
import { intersectAll } from './set-intersection.ts';

test('intersectAll returns a copy of the single set when only one is given', () => {
    const original = new Set(['a', 'b']);
    const result = intersectAll([original]);
    assert.deepStrictEqual(Array.from(result), ['a', 'b']);
    assert.notStrictEqual(result, original);
});

test('intersectAll returns elements present in every set', () => {
    const result = intersectAll([new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']), new Set(['c', 'b'])]);
    assert.deepStrictEqual(Array.from(result).sort(), ['b', 'c']);
});

test('intersectAll returns an empty set when no element is present in every set', () => {
    const result = intersectAll([new Set(['a']), new Set(['b'])]);
    assert.deepStrictEqual(Array.from(result), []);
});

test('intersectAll preserves the iteration order of the first set', () => {
    const result = intersectAll([new Set(['c', 'a', 'b']), new Set(['a', 'b', 'c'])]);
    assert.deepStrictEqual(Array.from(result), ['c', 'a', 'b']);
});
