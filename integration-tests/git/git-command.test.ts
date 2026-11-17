import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createChildProcessGitCommandExecutor, spawnChildProcessGitCommand } from '../../source/git/git-command.ts';
import { withPromiseDeadline } from '../../source/test-libraries/promise-with-deadline.ts';

const realChildProcessDeadlineMilliseconds = 5000;

suite('git-command', function () {
    test('runChildProcessGitCommand resolves stdout and stderr from a child process', async function () {
        const runChildProcessGitCommand = createChildProcessGitCommandExecutor(spawnChildProcessGitCommand);
        const result = await withPromiseDeadline(
            runChildProcessGitCommand(process.execPath, [
                '-e',
                'process.stdout.write("stdout"); process.stderr.write("stderr");'
            ]),
            'child process git command success',
            realChildProcessDeadlineMilliseconds
        );
        assert.deepStrictEqual(result, {
            standardOutput: 'stdout',
            standardError: 'stderr'
        });
    });

    test('runChildProcessGitCommand rejects failed child processes', async function () {
        const runChildProcessGitCommand = createChildProcessGitCommandExecutor(spawnChildProcessGitCommand);
        await assert.rejects(
            withPromiseDeadline(
                runChildProcessGitCommand(process.execPath, [ '-e', 'process.exit(13);' ]),
                'failed child process git command',
                realChildProcessDeadlineMilliseconds
            ),
            /Command failed/u
        );
    });

    test('runChildProcessGitCommand rejects launch failures', async function () {
        const runChildProcessGitCommand = createChildProcessGitCommandExecutor(spawnChildProcessGitCommand);
        await assert.rejects(
            withPromiseDeadline(
                runChildProcessGitCommand('/definitely-missing/packtory-git-command', []),
                'missing child process git command',
                realChildProcessDeadlineMilliseconds
            ),
            /^Error: spawn \/definitely-missing\/packtory-git-command ENOENT$/u
        );
    });
});
