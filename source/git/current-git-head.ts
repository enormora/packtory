type GitCommandRunner = (
    command: string,
    args: readonly string[]
) => Promise<{ readonly stdout: string; readonly stderr: string; }>;

export type CurrentGitHeadReader = () => Promise<string | undefined>;

type GitHeadOutput = {
    readonly stdout: string | null;
};

type CurrentGitHeadReaderDependencies = {
    readonly runGitCommand: GitCommandRunner;
    readonly repositoryFolder: string;
};

async function runGitHeadCommand(
    dependencies: CurrentGitHeadReaderDependencies
): Promise<{ readonly stdout: string; readonly stderr: string; }> {
    return dependencies.runGitCommand(
        'git',
        [ '-C', dependencies.repositoryFolder, 'rev-parse', '--verify', 'HEAD' ]
    );
}

async function readGitHeadOutput(dependencies: CurrentGitHeadReaderDependencies): Promise<GitHeadOutput> {
    try {
        const result = await runGitHeadCommand(dependencies);
        return { stdout: result.stdout };
    } catch {
        return { stdout: null };
    }
}

function readCurrentGitHead(output: GitHeadOutput): string | undefined {
    if (output.stdout === null) {
        return undefined;
    }
    const currentGitHead = output.stdout.trim();
    return currentGitHead.length === 0 ? undefined : currentGitHead;
}

export function createCurrentGitHeadReader(dependencies: CurrentGitHeadReaderDependencies): CurrentGitHeadReader {
    return async function () {
        return readCurrentGitHead(await readGitHeadOutput(dependencies));
    };
}
