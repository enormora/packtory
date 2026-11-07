import assert from 'node:assert';
import { suite, test } from 'mocha';
import { errorMessage } from './error-message.ts';

suite('error-message', function () {
    test('preserves exception messages', function () {
        assert.strictEqual(errorMessage(new Error('failed')), 'failed');
    });

    test('formats non-Error failures', function () {
        assert.strictEqual(errorMessage('failed'), 'failed');
        assert.strictEqual(errorMessage(null), 'null');
    });
});
