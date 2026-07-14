import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const gitExecutable = '/usr/bin/git';

async function git(workingDirectory: string, args: readonly string[]): Promise<void> {
    await new Promise<void>(function (resolve, reject) {
        execFile(gitExecutable, args, {
            cwd: workingDirectory,
            timeout: 5000
        }, function (error) {
            if (error === null) {
                resolve();
                return;
            }
            reject(error instanceof Error ? error : new Error('Git command failed', { cause: error }));
        });
    });
}

async function configureRepository(repositoryPath: string): Promise<void> {
    await git(repositoryPath, [ 'init', '--initial-branch=main' ]);
    await git(repositoryPath, [ 'config', 'user.name', 'Packtory Test' ]);
    await git(repositoryPath, [ 'config', 'user.email', 'packtory@example.test' ]);
}

async function commitBase(repositoryPath: string): Promise<void> {
    await writeFile(path.join(repositoryPath, 'README.md'), 'base\n');
    await git(repositoryPath, [ 'add', 'README.md' ]);
    await git(repositoryPath, [ 'commit', '-m', 'Initial commit' ]);
    await git(repositoryPath, [ '-c', 'tag.gpgSign=false', 'tag', '--no-sign', 'pkg-a@1.0.0', 'HEAD' ]);
}

async function commitMergedPullRequest(
    repositoryPath: string,
    pullRequestNumber: number,
    branchName: string,
    title: string
): Promise<void> {
    await git(repositoryPath, [
        'commit',
        '--allow-empty',
        '-m',
        `Merge pull request #${pullRequestNumber} from owner/${branchName}`,
        '-m',
        title
    ]);
}

export async function createChangelogGitRepository(): Promise<string> {
    const repositoryPath = await mkdtemp(path.join(os.tmpdir(), 'packtory-pr-log-'));
    await configureRepository(repositoryPath);
    await commitBase(repositoryPath);
    await commitMergedPullRequest(repositoryPath, 1, 'update-react', 'Update React to v19');
    await commitMergedPullRequest(repositoryPath, 2, 'move-readme', 'Move package README into source/packages');
    await commitMergedPullRequest(repositoryPath, 3, 'update-readme', 'Update package README content');
    return repositoryPath;
}
