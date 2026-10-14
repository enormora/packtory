type GitCommandRunner = (
    command: string,
    commandArguments: readonly string[]
) => Promise<{ readonly standardOutput: string; readonly standardError: string; }>;

export type CurrentGitHeadReader = () => Promise<string | undefined>;

type GitHeadOutput = {
    readonly standardOutput: string | null;
};

type CurrentGitHeadReaderDependencies = {
    readonly runGitCommand: GitCommandRunner;
    readonly repositoryFolder: string;
};

async function runGitHeadCommand(
    dependencies: CurrentGitHeadReaderDependencies
): Promise<{ readonly standardOutput: string; readonly standardError: string; }> {
    return dependencies.runGitCommand(
        'git',
        [ '-C', dependencies.repositoryFolder, 'rev-parse', '--verify', 'HEAD' ]
    );
}

async function readGitHeadOutput(dependencies: CurrentGitHeadReaderDependencies): Promise<GitHeadOutput> {
    try {
        const result = await runGitHeadCommand(dependencies);
        return { standardOutput: result.standardOutput };
    } catch {
        return { standardOutput: null };
    }
}

function readCurrentGitHead(output: GitHeadOutput): string | undefined {
    if (output.standardOutput === null) {
        return undefined;
    }
    const currentGitHead = output.standardOutput.trim();
    return currentGitHead.length === 0 ? undefined : currentGitHead;
}

export function createCurrentGitHeadReader(dependencies: CurrentGitHeadReaderDependencies): CurrentGitHeadReader {
    return async function () {
        return readCurrentGitHead(await readGitHeadOutput(dependencies));
    };
}
