/// <reference lib="es2024.promise" />

import { execFile as executeFile, type ExecFileException as ExecuteFileException } from 'node:child_process';

type GitCommandResult = {
    readonly standardOutput: string;
    readonly standardError: string;
};
export type GitCommandRunner = (command: string, commandArguments: readonly string[]) => Promise<GitCommandResult>;
type GitCommandExecutorResult = {
    readonly standardOutput: Readonly<Buffer> | string;
    readonly standardError: Readonly<Buffer> | string;
};
type GitCommandExecutor = (command: string, commandArguments: readonly string[]) => Promise<GitCommandExecutorResult>;
type GitCommandChildProcess = {
    readonly once: (eventName: 'close', listener: () => void) => GitCommandChildProcess;
};
type ExecuteFileCallback = (
    error: Readonly<ExecuteFileException> | null,
    standardOutput: Readonly<Buffer> | string,
    standardError: Readonly<Buffer> | string
) => void;
type SpawnGitCommand = (
    command: string,
    commandArguments: readonly string[],
    callback: ExecuteFileCallback
) => GitCommandChildProcess;
type Deferred<T> = {
    readonly promise: Promise<T>;
    readonly reject: (reason: unknown) => void;
    readonly resolve: (value: T) => void;
};
function toGitCommandError(error: unknown): Error {
    return error instanceof Error ? error : new Error('Git command failed');
}

function toGitCommandResult(result: GitCommandExecutorResult): GitCommandResult {
    const standardOutputText = String(result.standardOutput);
    const standardErrorText = String(result.standardError);
    return { standardOutput: standardOutputText, standardError: standardErrorText };
}

export function createGitCommandRunner(executeGitCommand: GitCommandExecutor): GitCommandRunner {
    return async function (command, commandArguments) {
        try {
            return toGitCommandResult(await executeGitCommand(command, Array.from(commandArguments)));
        } catch (error: unknown) {
            throw toGitCommandError(error);
        }
    };
}

function reportExecuteFileResult(
    deferred: Deferred<GitCommandExecutorResult>,
    error: Readonly<ExecuteFileException> | null,
    standardOutput: Readonly<Buffer> | string,
    standardError: Readonly<Buffer> | string
): void {
    if (error === null) {
        deferred.resolve({ standardOutput, standardError });
        return;
    }
    deferred.reject(error);
}

function* gitCommandCompletionSignals(
    output: Deferred<GitCommandExecutorResult>,
    closed: Deferred<never>
): Generator<Promise<GitCommandExecutorResult> | Promise<never>> {
    yield output.promise;
    yield closed.promise;
}

async function runUntilOutputOrClose(
    output: Deferred<GitCommandExecutorResult>,
    closed: Deferred<never>
): Promise<GitCommandExecutorResult> {
    return await Promise.race(gitCommandCompletionSignals(output, closed));
}

export function createChildProcessGitCommandExecutor(spawnGitCommand: SpawnGitCommand): GitCommandExecutor {
    return async function (command, commandArguments) {
        const output = Promise.withResolvers<GitCommandExecutorResult>();
        const closed = Promise.withResolvers<never>();
        const callback: ExecuteFileCallback = function (error, standardOutput, standardError) {
            reportExecuteFileResult(output, error, standardOutput, standardError);
        };
        const rejectClosedChildProcess = closed.reject.bind(
            undefined,
            new Error('Child process closed before reporting output')
        );
        const childProcess = spawnGitCommand(command, Array.from(commandArguments), callback);
        childProcess.once('close', rejectClosedChildProcess);
        return await runUntilOutputOrClose(output, closed);
    };
}

export function spawnChildProcessGitCommand(
    command: string,
    commandArguments: readonly string[],
    callback: ExecuteFileCallback
): GitCommandChildProcess {
    return executeFile(command, Array.from(commandArguments), callback);
}
