import { tryOr as tryTaskOr } from 'true-myth/task';

type GitCommandRunner = (
    command: string,
    args: readonly string[]
) => Promise<{ readonly stdout: string; readonly stderr: string; }>;

export type CurrentGitHeadReader = () => Promise<string | undefined>;

type GitCommandResult = Awaited<ReturnType<GitCommandRunner>>;

type CurrentGitHeadReaderDependencies = {
    readonly runGitCommand: GitCommandRunner;
    readonly repositoryFolder: string;
};

async function readGitHeadResult(
    dependencies: CurrentGitHeadReaderDependencies
): Promise<GitCommandResult | undefined> {
    const result = await tryTaskOr(undefined, async function () {
        return dependencies.runGitCommand(
            'git',
            [ '-C', dependencies.repositoryFolder, 'rev-parse', '--verify', 'HEAD' ]
        );
    });
    return result.unwrapOr(undefined);
}

export function createCurrentGitHeadReader(dependencies: CurrentGitHeadReaderDependencies): CurrentGitHeadReader {
    return async function () {
        const result = await readGitHeadResult(dependencies);
        if (result === undefined) {
            return undefined;
        }
        const currentGitHead = result.stdout.trim();
        return currentGitHead.length === 0 ? undefined : currentGitHead;
    };
}
