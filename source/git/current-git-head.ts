export type GitCommandRunner = (
    command: string,
    args: readonly string[]
) => Promise<{ readonly stdout: string; readonly stderr: string }>;

export type CurrentGitHeadReader = () => Promise<string | undefined>;

export function createCurrentGitHeadReader(dependencies: {
    readonly runGitCommand: GitCommandRunner;
    readonly repositoryFolder: string;
}): CurrentGitHeadReader {
    return async () => {
        function markGitFailure(): null {
            return null;
        }

        const result = await dependencies
            .runGitCommand('git', ['-C', dependencies.repositoryFolder, 'rev-parse', '--verify', 'HEAD'])
            .catch(markGitFailure);
        if (result === null) {
            return undefined;
        }
        const currentGitHead = result.stdout.trim();
        return currentGitHead.length === 0 ? undefined : currentGitHead;
    };
}

export function createCachedCurrentGitHeadReader(readCurrentGitHead: CurrentGitHeadReader): CurrentGitHeadReader {
    let currentGitHead: { readonly value: Promise<string | undefined> } | null = null;

    return async () => {
        if (currentGitHead === null) {
            currentGitHead = { value: readCurrentGitHead() };
        }
        return currentGitHead.value;
    };
}
