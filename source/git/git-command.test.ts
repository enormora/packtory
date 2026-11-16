import assert from 'node:assert';
import { suite, test } from 'mocha';
import { withPromiseDeadline } from '../test-libraries/promise-with-deadline.ts';
import { createChildProcessGitCommandExecutor, createGitCommandRunner } from './git-command.ts';

type FakeGitCommandChildProcess = {
    readonly once: (eventName: 'close', listener: () => void) => FakeGitCommandChildProcess;
};
function createFakeGitCommandChildProcess(
    recordCloseListener: (listener: () => void) => void
): FakeGitCommandChildProcess {
    const childProcess = {
        once(eventName: 'close', listener: () => void) {
            assert.strictEqual(eventName, 'close');
            recordCloseListener(listener);
            return childProcess;
        }
    };
    return childProcess;
}

suite('git-command', function () {
    test('createGitCommandRunner resolves stdout and stderr from the executor', async function () {
        const runner = createGitCommandRunner(async function (command, commandArguments) {
            assert.strictEqual(command, 'git');
            assert.deepStrictEqual(commandArguments, [ 'status', '--short' ]);
            return {
                standardOutput: Buffer.from('stdout'),
                standardError: 'stderr'
            };
        });
        assert.deepStrictEqual(await runner('git', [ 'status', '--short' ]), {
            standardOutput: 'stdout',
            standardError: 'stderr'
        });
    });

    test('createGitCommandRunner copies readonly args before calling executeFile', async function () {
        const sourceArguments = [ 'rev-parse', 'HEAD' ] as const;
        let receivedArguments: readonly string[] = [];
        const runner = createGitCommandRunner(async function (_command, commandArguments) {
            receivedArguments = commandArguments;
            return {
                standardOutput: '',
                standardError: ''
            };
        });
        await runner('git', sourceArguments);
        assert.deepStrictEqual(sourceArguments, [ 'rev-parse', 'HEAD' ]);
        assert.notStrictEqual(receivedArguments, sourceArguments);
    });

    test('createGitCommandRunner rejects executor errors', async function () {
        const error = new Error('git failed');
        const runner = createGitCommandRunner(async function () {
            throw error;
        });
        await assert.rejects(runner('git', [ 'status' ]), error);
    });

    test('createGitCommandRunner rejects non-Error failures with a stable message', async function () {
        const nonError = Object.create(null) as Error;
        const runner = createGitCommandRunner(async function () {
            throw nonError;
        });
        await assert.rejects(runner('git', [ 'status' ]), /^Error: Git command failed$/u);
    });

    test('createChildProcessGitCommandExecutor resolves stdout and stderr from the child callback', async function () {
        const sourceArguments = [ 'status', '--short' ] as const;
        const executeGitCommand = createChildProcessGitCommandExecutor(function (command, commandArguments, callback) {
            assert.strictEqual(command, 'git');
            assert.deepStrictEqual(commandArguments, [ 'status', '--short' ]);
            assert.notStrictEqual(commandArguments, sourceArguments);
            callback(null, 'stdout', 'stderr');
            return createFakeGitCommandChildProcess(function (listener) {
                assert.strictEqual(typeof listener, 'function');
            });
        });
        assert.deepStrictEqual(
            await withPromiseDeadline(executeGitCommand('git', sourceArguments), 'child process git command callback'),
            {
                standardOutput: 'stdout',
                standardError: 'stderr'
            }
        );
    });

    test('createChildProcessGitCommandExecutor rejects child processes that close before callback', async function () {
        let closeChildProcess = function (): void {
            assert.fail('Expected close listener registration');
        };
        const executeGitCommand = createChildProcessGitCommandExecutor(function () {
            return createFakeGitCommandChildProcess(function (listener) {
                closeChildProcess = listener;
            });
        });
        const result = executeGitCommand('git', []);
        closeChildProcess();
        await assert.rejects(
            withPromiseDeadline(result, 'child process git command close'),
            /^Error: Child process closed before reporting output$/u
        );
    });

    test('propagates a process callback failure without waiting for close', async function () {
        const failure = new Error('git failed');
        const execute = createChildProcessGitCommandExecutor(function (_command, _args, callback) {
            callback(failure, '', '');
            return createFakeGitCommandChildProcess(function () {
                return undefined;
            });
        });
        await assert.rejects(
            withPromiseDeadline(execute('git', []), 'child process git command failure'),
            function (error) {
                return error === failure;
            }
        );
    });
});
