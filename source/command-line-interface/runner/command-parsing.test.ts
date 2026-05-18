import assert from 'node:assert';
import { suite, test } from 'mocha';
import { getParseExitCode } from './command-parsing.ts';

suite('command-parsing', function () {
    test('getParseExitCode returns undefined when the parse result has no error key', function () {
        const calls: string[] = [];
        const logged = (message: string): void => {
            calls.push(message);
        };

        assert.strictEqual(getParseExitCode(logged, { command: 'noop' } as never), undefined);
        assert.deepStrictEqual(calls, []);
    });

    test('getParseExitCode logs the error message and returns its exit code when the parse failed', function () {
        const calls: string[] = [];
        const logged = (message: string): void => {
            calls.push(message);
        };

        const exitCode = getParseExitCode(logged, {
            error: { config: { message: 'bad usage', exitCode: 2 } }
        } as never);

        assert.strictEqual(exitCode, 2);
        assert.deepStrictEqual(calls, ['bad usage']);
    });
});
