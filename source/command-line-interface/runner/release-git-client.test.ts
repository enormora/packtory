import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createReleaseGitClient, type ReleaseGitClient } from './release-git-client.ts';

type ReleaseGitCommandRunner = (
    command: string,
    args: readonly string[]
) => Promise<{ readonly stdout: string; readonly stderr: string; }>;

type GitCall = {
    readonly command: string;
    readonly args: readonly string[];
};

type ReleaseGitClientFixture = {
    readonly calls: readonly GitCall[];
    readonly client: ReleaseGitClient;
};

function createGitClientWithRunner(run: ReleaseGitCommandRunner): ReleaseGitClientFixture {
    const calls: GitCall[] = [];
    return {
        calls,
        client: createReleaseGitClient({
            repositoryFolder: '/repo',
            async runGitCommand(command, args) {
                calls.push({ command, args });
                return run(command, args);
            }
        })
    };
}

function expectedPushHeadToBranchCalls(leaseHead: string): readonly GitCall[] {
    return [
        {
            command: 'git',
            args: [
                '-C',
                '/repo',
                'fetch',
                'origin',
                'refs/heads/release/packtory:refs/remotes/origin/release/packtory'
            ]
        },
        {
            command: 'git',
            args: [ '-C', '/repo', 'rev-parse', '--verify', 'refs/remotes/origin/release/packtory' ]
        },
        {
            command: 'git',
            args: [
                '-C',
                '/repo',
                'push',
                `--force-with-lease=refs/heads/release/packtory:${leaseHead}`,
                'origin',
                'HEAD:refs/heads/release/packtory'
            ]
        }
    ];
}

suite('release-git-client', function () {
    suite('ensureClean', function () {
        test('succeeds when git status is empty', async function () {
            const { calls, client } = createGitClientWithRunner(async function () {
                return { stdout: '', stderr: '' };
            });

            await client.ensureClean();

            assert.deepStrictEqual(calls[0], {
                command: 'git',
                args: [ '-C', '/repo', 'status', '--porcelain=v1' ]
            });
        });

        test('rejects dirty index and worktree output', async function () {
            const { client } = createGitClientWithRunner(async function () {
                return { stdout: ' M CHANGELOG.md\n', stderr: '' };
            });

            await assert.rejects(client.ensureClean(), /Git index and worktree must be clean/u);
        });
    });

    suite('ensureTag', function () {
        test('accepts an existing tag at the target head', async function () {
            const { calls, client } = createGitClientWithRunner(async function (_command, args) {
                if (args.includes('rev-parse')) {
                    return { stdout: 'head-a\n', stderr: '' };
                }
                throw new Error('unexpected write');
            });

            await client.ensureTag('pkg-a@1.0.0', 'pkg-a@1.0.0', 'head-a');

            assert.deepStrictEqual(calls, [
                {
                    command: 'git',
                    args: [ '-C', '/repo', 'rev-parse', '--verify', 'refs/tags/pkg-a@1.0.0^{}' ]
                }
            ]);
        });

        test('rejects an existing tag at another head', async function () {
            const { client } = createGitClientWithRunner(async function () {
                return { stdout: 'head-b\n', stderr: '' };
            });

            await assert.rejects(client.ensureTag('pkg-a@1.0.0', 'pkg-a@1.0.0', 'head-a'), /already exists/u);
        });

        test('creates an annotated tag when none exists', async function () {
            const { calls, client } = createGitClientWithRunner(async function (_command, args) {
                if (args.includes('rev-parse')) {
                    throw new Error('missing tag');
                }
                return { stdout: '', stderr: '' };
            });

            await client.ensureTag('pkg-a@1.0.0', 'pkg-a@1.0.0', 'head-a');

            assert.deepStrictEqual(calls[1], {
                command: 'git',
                args: [ '-C', '/repo', 'tag', '-a', 'pkg-a@1.0.0', '-m', 'pkg-a@1.0.0', 'head-a' ]
            });
        });
    });

    suite('commit', function () {
        test('stages changelog files and creates a release commit', async function () {
            const { calls, client } = createGitClientWithRunner(async function () {
                return { stdout: '', stderr: '' };
            });

            await client.commit([ '/repo/CHANGELOG.md' ], 'Release packages');

            assert.deepStrictEqual(calls, [
                { command: 'git', args: [ '-C', '/repo', 'add', '--', '/repo/CHANGELOG.md' ] },
                { command: 'git', args: [ '-C', '/repo', 'commit', '-m', 'Release packages' ] }
            ]);
        });

        test('rejects empty changelog file lists', async function () {
            const { client } = createGitClientWithRunner(async function () {
                return { stdout: '', stderr: '' };
            });

            await assert.rejects(client.commit([], 'Release packages'), /No changelog files were written/u);
        });
    });

    suite('currentHead', function () {
        test('returns a non-empty current Git head', async function () {
            const { calls, client } = createGitClientWithRunner(async function () {
                return { stdout: 'head-a\n', stderr: '' };
            });

            assert.strictEqual(await client.currentHead(), 'head-a');
            assert.deepStrictEqual(calls, [
                { command: 'git', args: [ '-C', '/repo', 'rev-parse', '--verify', 'HEAD' ] }
            ]);
        });

        test('rejects empty Git output', async function () {
            const { client } = createGitClientWithRunner(async function () {
                return { stdout: '\n', stderr: '' };
            });

            await assert.rejects(client.currentHead(), /Unable to read/u);
        });
    });

    suite('remote updates', function () {
        test('pushFollowTags invokes git push with follow-tags', async function () {
            const { calls, client } = createGitClientWithRunner(async function () {
                return { stdout: '', stderr: '' };
            });

            await client.pushFollowTags();

            assert.deepStrictEqual(calls[0], {
                command: 'git',
                args: [ '-C', '/repo', 'push', '--follow-tags' ]
            });
        });

        test('deleteRemoteBranch ignores missing remote branches', async function () {
            const { calls, client } = createGitClientWithRunner(async function () {
                throw new Error('missing branch');
            });

            await client.deleteRemoteBranch('release/packtory');

            assert.deepStrictEqual(calls[0], {
                command: 'git',
                args: [ '-C', '/repo', 'push', 'origin', '--delete', 'release/packtory' ]
            });
        });

        test('pushHeadToBranch pushes with a lease for an existing remote branch', async function () {
            const { calls, client } = createGitClientWithRunner(async function (_command, args) {
                if (args.includes('rev-parse')) {
                    return { stdout: 'remote-head\n', stderr: '' };
                }
                return { stdout: '', stderr: '' };
            });

            await client.pushHeadToBranch('release/packtory');

            assert.deepStrictEqual(calls, expectedPushHeadToBranchCalls('remote-head'));
        });

        test('pushHeadToBranch pushes with an empty lease for a new remote branch', async function () {
            const { calls, client } = createGitClientWithRunner(async function (_command, args) {
                if (args.includes('rev-parse')) {
                    throw new Error('missing branch');
                }
                return { stdout: '', stderr: '' };
            });

            await client.pushHeadToBranch('release/packtory');

            assert.deepStrictEqual(calls, expectedPushHeadToBranchCalls(''));
        });
    });
});
