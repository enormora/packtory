import assert from 'node:assert';
import { suite, test } from 'mocha';
import { isTerminal } from './terminal.ts';

suite('terminal', function () {
    test('recognizes a terminal stream', function () {
        assert.strictEqual(isTerminal({ isTTY: true }), true);
    });

    test('rejects redirected output and streams without terminal metadata', function () {
        assert.strictEqual(isTerminal({ isTTY: false }), false);
        assert.strictEqual(isTerminal({ isTTY: undefined }), false);
    });
});
