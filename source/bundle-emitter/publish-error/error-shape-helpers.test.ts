import assert from 'node:assert';
import { test } from 'mocha';
import { ensureError, isErrorLike, isRecord } from './error-shape-helpers.ts';

test('isRecord returns true for object values', () => {
    assert.strictEqual(isRecord({}), true);
    assert.strictEqual(isRecord({ a: 1 }), true);
});

test('isRecord returns false for null, primitives, and undefined', () => {
    assert.strictEqual(isRecord(null), false);
    assert.strictEqual(isRecord(undefined), false);
    assert.strictEqual(isRecord('s'), false);
    assert.strictEqual(isRecord(42), false);
});

test('isErrorLike returns true when the value has a string message property', () => {
    assert.strictEqual(isErrorLike({ message: 'boom' }), true);
});

test('isErrorLike returns false when message is missing or not a string', () => {
    assert.strictEqual(isErrorLike({}), false);
    assert.strictEqual(isErrorLike({ message: 42 }), false);
    assert.strictEqual(isErrorLike(null), false);
});

test('ensureError returns the value unchanged when it is already an Error instance', () => {
    const original = new Error('boom');
    assert.strictEqual(ensureError(original), original);
});

test('ensureError wraps non-Error values via String coercion', () => {
    const wrapped = ensureError('plain string');
    assert.ok(wrapped instanceof Error);
    assert.strictEqual(wrapped.message, 'plain string');
});
