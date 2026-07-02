import assert from 'node:assert';
import { suite, test } from 'mocha';
import { withPromiseDeadline } from '../test-libraries/promise-with-deadline.ts';
import {
    createChildProcessGitCommandExecutor,
    createGitCommandRunner,
    spawnChildProcessGitCommand
} from './git-command.ts';

type FakeGitCommandChildProcess = {
    readonly once: (eventName: 'close', listener: () => void) => FakeGitCommandChildProcess;
};

const runChildProcessGitCommand = createChildProcessGitCommandExecutor(spawnChildProcessGitCommand);

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
        const runner = createGitCommandRunner(async function (command, args) {
            assert.strictEqual(command, 'git');
            assert.deepStrictEqual(args, [ 'status', '--short' ]);
            return { stdout: Buffer.from('stdout'), stderr: 'stderr' };
        });

        assert.deepStrictEqual(await runner('git', [ 'status', '--short' ]), {
            stdout: 'stdout',
            stderr: 'stderr'
        });
    });

    test('createGitCommandRunner copies readonly args before calling execFile', async function () {
        const sourceArgs = [ 'rev-parse', 'HEAD' ] as const;
        let receivedArgs: readonly string[] = [];
        const runner = createGitCommandRunner(async function (_command, args) {
            receivedArgs = args;
            return { stdout: '', stderr: '' };
        });

        await runner('git', sourceArgs);

        assert.deepStrictEqual(sourceArgs, [ 'rev-parse', 'HEAD' ]);
        assert.notStrictEqual(receivedArgs, sourceArgs);
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
        const sourceArgs = [ 'status', '--short' ] as const;
        const executeGitCommand = createChildProcessGitCommandExecutor(function (command, args, callback) {
            assert.strictEqual(command, 'git');
            assert.deepStrictEqual(args, [ 'status', '--short' ]);
            assert.notStrictEqual(args, sourceArgs);
            callback(null, 'stdout', 'stderr');
            return createFakeGitCommandChildProcess(function (listener) {
                assert.strictEqual(typeof listener, 'function');
            });
        });

        assert.deepStrictEqual(
            await withPromiseDeadline(executeGitCommand('git', sourceArgs), 'child process git command callback'),
            {
                stdout: 'stdout',
                stderr: 'stderr'
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

    test('runChildProcessGitCommand resolves stdout and stderr from a child process', async function () {
        const result = await withPromiseDeadline(
            runChildProcessGitCommand(process.execPath, [
                '-e',
                'process.stdout.write("stdout"); process.stderr.write("stderr");'
            ]),
            'child process git command success',
            500
        );

        assert.deepStrictEqual(result, { stdout: 'stdout', stderr: 'stderr' });
    });

    test('runChildProcessGitCommand rejects failed child processes', async function () {
        await assert.rejects(
            withPromiseDeadline(
                runChildProcessGitCommand(process.execPath, [ '-e', 'process.exit(13);' ]),
                'failed child process git command',
                500
            ),
            /Command failed/u
        );
    });

    test('runChildProcessGitCommand rejects launch failures', async function () {
        await assert.rejects(
            withPromiseDeadline(
                runChildProcessGitCommand('/definitely-missing/packtory-git-command', []),
                'missing child process git command',
                500
            ),
            /^Error: spawn \/definitely-missing\/packtory-git-command ENOENT$/u
        );
    });
});
