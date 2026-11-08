import assert from 'node:assert';
import { suite, test } from 'mocha';
import { ensureError, errorMessage } from './error-normalization.ts';

suite('error-normalization', function () {
    test('preserves exception messages', function () {
        assert.strictEqual(errorMessage(new Error('failed')), 'failed');
    });

    test('formats non-Error failures', function () {
        assert.strictEqual(errorMessage('failed'), 'failed');
        assert.strictEqual(errorMessage(null), 'null');
    });

    test('ensureError returns the value unchanged when it is already an Error instance', function () {
        const original = new Error('boom');
        assert.strictEqual(ensureError(original), original);
    });

    test('ensureError wraps non-Error values via String coercion', function () {
        const wrapped = ensureError('plain string');
        assert.ok(wrapped instanceof Error);
        assert.strictEqual(wrapped.message, 'plain string');
    });
});
