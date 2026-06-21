import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createCurrentGitHeadReader } from './current-git-head.ts';

suite('current-git-head', function () {
    test('reads and trims the current git head', async function () {
        const reader = createCurrentGitHeadReader({
            repositoryFolder: '/repo',
            async runGitCommand(command, args) {
                assert.strictEqual(command, 'git');
                assert.deepStrictEqual(args, ['-C', '/repo', 'rev-parse', '--verify', 'HEAD']);
                return { stdout: 'abcdef123456\n', stderr: '' };
            }
        });

        assert.strictEqual(await reader(), 'abcdef123456');
    });

    test('returns undefined when git returns empty output', async function () {
        const reader = createCurrentGitHeadReader({
            repositoryFolder: '/repo',
            async runGitCommand() {
                return { stdout: '\n', stderr: '' };
            }
        });

        assert.strictEqual(await reader(), undefined);
    });

    test('returns undefined when git fails', async function () {
        const reader = createCurrentGitHeadReader({
            repositoryFolder: '/repo',
            async runGitCommand() {
                throw new Error('not a git repository');
            }
        });

        assert.strictEqual(await reader(), undefined);
    });
});
