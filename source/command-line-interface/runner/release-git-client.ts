import assert from 'node:assert';

type ReleaseGitCommandRunner = (
    command: string,
    args: readonly string[]
) => Promise<{ readonly stdout: string; readonly stderr: string; }>;

type ReleaseGitFileChange = {
    readonly contentBase64: string;
    readonly kind: 'addition';
    readonly path: string;
};

export type ReleaseGitClient = {
    readonly commit: (filePaths: readonly string[], message: string) => Promise<void>;
    readonly currentHead: () => Promise<string>;
    readonly deleteRemoteBranch: (branch: string) => Promise<void>;
    readonly ensureClean: () => Promise<void>;
    readonly ensureTag: (tagName: string, message: string, targetHead: string) => Promise<void>;
    readonly pushHeadToBranch: (branch: string) => Promise<void>;
    readonly pushFollowTags: () => Promise<void>;
    readonly readChangedFiles: (baseHead: string, targetHead: string) => Promise<readonly ReleaseGitFileChange[]>;
};

type ReleaseGitClientDependencies = {
    readonly repositoryFolder: string;
    readonly runGitCommand: ReleaseGitCommandRunner;
};
type GitOutputResult = { readonly kind: 'found'; readonly value: string; } | { readonly kind: 'missing'; };

async function runGit(deps: ReleaseGitClientDependencies, args: readonly string[]): Promise<string> {
    const result = await deps.runGitCommand('git', [ '-C', deps.repositoryFolder, ...args ]);
    return result.stdout.trim();
}

async function runGitRaw(deps: ReleaseGitClientDependencies, args: readonly string[]): Promise<string> {
    const result = await deps.runGitCommand('git', [ '-C', deps.repositoryFolder, ...args ]);
    return result.stdout;
}

async function readGitOutputResult(
    deps: ReleaseGitClientDependencies,
    args: readonly string[]
): Promise<GitOutputResult> {
    try {
        return { kind: 'found', value: await runGit(deps, args) };
    } catch {
        return { kind: 'missing' };
    }
}

function splitGitPathOutput(output: string): readonly string[] {
    return output.split('\0').filter(function (path) {
        return path.length > 0;
    });
}

async function readFileAtRevision(
    deps: ReleaseGitClientDependencies,
    revision: string,
    filePath: string
): Promise<string> {
    return runGitRaw(deps, [ 'show', `${revision}:${filePath}` ]);
}

export function createReleaseGitClient(deps: ReleaseGitClientDependencies): ReleaseGitClient {
    return {
        async commit(filePaths, message) {
            if (filePaths.length === 0) {
                throw new Error('No changelog files were written; cannot create a release commit');
            }
            await runGit(deps, [ 'add', '--', ...filePaths ]);
            await runGit(deps, [ 'commit', '-m', message ]);
        },

        async currentHead() {
            const head = await runGit(deps, [ 'rev-parse', '--verify', 'HEAD' ]);
            if (head.length === 0) {
                throw new Error('Unable to read the current Git head');
            }
            return head;
        },

        async deleteRemoteBranch(branch) {
            await readGitOutputResult(deps, [ 'push', 'origin', '--delete', branch ]);
        },

        async ensureClean() {
            const status = await runGit(deps, [ 'status', '--porcelain=v1' ]);
            if (status.length > 0) {
                throw new Error('Git index and worktree must be clean before release writes');
            }
        },

        async ensureTag(tagName, message, targetHead) {
            const existingTag = await readGitOutputResult(deps, [ 'rev-parse', '--verify', `refs/tags/${tagName}^{}` ]);
            if (existingTag.kind === 'missing') {
                await runGit(deps, [ 'tag', '-a', tagName, '-m', message, targetHead ]);
                return;
            }
            assert.strictEqual(existingTag.kind, 'found');
            if (existingTag.value === targetHead) {
                return;
            }
            throw new Error(`Tag "${tagName}" already exists at ${existingTag.value}, expected ${targetHead}`);
        },

        async pushHeadToBranch(branch) {
            await readGitOutputResult(deps, [
                'fetch',
                'origin',
                `refs/heads/${branch}:refs/remotes/origin/${branch}`
            ]);
            const remoteBranch = await readGitOutputResult(deps, [
                'rev-parse',
                '--verify',
                `refs/remotes/origin/${branch}`
            ]);
            const lease = remoteBranch.kind === 'found'
                ? `--force-with-lease=refs/heads/${branch}:${remoteBranch.value}`
                : `--force-with-lease=refs/heads/${branch}:`;
            await runGit(deps, [ 'push', lease, 'origin', `HEAD:refs/heads/${branch}` ]);
        },

        async pushFollowTags() {
            await runGit(deps, [ 'push', '--follow-tags' ]);
        },

        async readChangedFiles(baseHead, targetHead) {
            const changedPaths = splitGitPathOutput(
                await runGit(deps, [ 'diff', '--name-only', '-z', '--diff-filter=AM', baseHead, targetHead, '--' ])
            );
            return Promise.all(
                changedPaths.map(async function (filePath) {
                    return {
                        contentBase64: Buffer.from(await readFileAtRevision(deps, targetHead, filePath)).toString(
                            'base64'
                        ),
                        kind: 'addition',
                        path: filePath
                    };
                })
            );
        }
    };
}
