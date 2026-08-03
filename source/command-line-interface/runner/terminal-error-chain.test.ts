import assert from 'node:assert';
import { suite, test } from 'mocha';
import { formatTerminalErrorBullet } from './terminal-error-chain.ts';

function createCauseChain(errorCount: number): Error {
    let error = new Error(`failure ${errorCount - 1}`);
    for (let index = errorCount - 2; index >= 0; index -= 1) {
        error = new Error(`failure ${index}`, { cause: error });
    }

    return error;
}

suite('terminal-error-chain', function () {
    suite('formatting', function () {
        test('formats a plain error message', function () {
            assert.strictEqual(formatTerminalErrorBullet(new Error('failed')), '- failed');
        });

        test('formats one cause level', function () {
            const error = new Error('failed', { cause: new Error('inner failure') });

            assert.strictEqual(formatTerminalErrorBullet(error), '- failed\n  Caused by: inner failure');
        });

        test('formats recursive cause messages', function () {
            const error = new Error('failed', {
                cause: new Error('middle failure', { cause: new Error('inner failure') })
            });

            assert.strictEqual(
                formatTerminalErrorBullet(error),
                '- failed\n  Caused by: middle failure\n    Caused by: inner failure'
            );
        });

        test('formats error-like causes', function () {
            const error = new Error('failed', { cause: { message: 'library failure' } });

            assert.strictEqual(formatTerminalErrorBullet(error), '- failed\n  Caused by: library failure');
        });

        test('indents multiline messages under the same failure', function () {
            const error = new Error('failed\nwith details', {
                cause: new Error('inner failure\nwith inner details')
            });

            assert.strictEqual(
                formatTerminalErrorBullet(error),
                '- failed\n  with details\n  Caused by: inner failure\n    with inner details'
            );
        });
    });

    suite('ignored causes', function () {
        test('ignores causes without a message', function () {
            const error = new Error('failed', { cause: { reason: 'hidden' } });

            assert.strictEqual(formatTerminalErrorBullet(error), '- failed');
        });

        test('ignores null causes', function () {
            const error = new Error('failed', { cause: null });

            assert.strictEqual(formatTerminalErrorBullet(error), '- failed');
        });

        test('ignores causes with non-string messages', function () {
            const error = new Error('failed', { cause: { message: 42 } });

            assert.strictEqual(formatTerminalErrorBullet(error), '- failed');
        });
    });

    suite('depth limits', function () {
        test('stops at circular cause chains', function () {
            const error = new Error('failed');
            Object.defineProperty(error, 'cause', { value: error });

            assert.strictEqual(formatTerminalErrorBullet(error), '- failed');
        });

        test('stops at two-node circular cause chains', function () {
            const error = new Error('failed');
            const cause = new Error('inner failure');
            Object.defineProperty(error, 'cause', { value: cause });
            Object.defineProperty(cause, 'cause', { value: error });

            assert.strictEqual(formatTerminalErrorBullet(error), '- failed\n  Caused by: inner failure');
        });

        test('stops after the maximum cause depth', function () {
            const message = formatTerminalErrorBullet(createCauseChain(102));
            const causeMatches = message.match(/Caused by:/gu);

            assert.strictEqual(causeMatches === null ? 0 : causeMatches.length, 100);
            assert.ok(message.includes('failure 100'));
            assert.ok(!message.includes('failure 101'));
        });
    });
});
