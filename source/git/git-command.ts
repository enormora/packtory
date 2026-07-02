/// <reference lib="es2024.promise" />

import { execFile, type ExecFileException } from 'node:child_process';

type GitCommandResult = {
    readonly stdout: string;
    readonly stderr: string;
};
export type GitCommandRunner = (command: string, args: readonly string[]) => Promise<GitCommandResult>;
type GitCommandExecutorResult = {
    readonly stdout: Readonly<Buffer> | string;
    readonly stderr: Readonly<Buffer> | string;
};
type GitCommandExecutor = (command: string, args: readonly string[]) => Promise<GitCommandExecutorResult>;
type GitCommandChildProcess = {
    readonly once: (eventName: 'close', listener: () => void) => GitCommandChildProcess;
};
type ExecFileCallback = (
    error: Readonly<ExecFileException> | null,
    stdout: Readonly<Buffer> | string,
    stderr: Readonly<Buffer> | string
) => void;
type SpawnGitCommand = (
    command: string,
    args: readonly string[],
    callback: ExecFileCallback
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
    const stdoutText = String(result.stdout);
    const stderrText = String(result.stderr);
    return { stdout: stdoutText, stderr: stderrText };
}

export function createGitCommandRunner(executeGitCommand: GitCommandExecutor): GitCommandRunner {
    return async function (command, args) {
        try {
            return toGitCommandResult(await executeGitCommand(command, Array.from(args)));
        } catch (error: unknown) {
            throw toGitCommandError(error);
        }
    };
}

function reportExecFileResult(
    deferred: Deferred<GitCommandExecutorResult>,
    error: Readonly<ExecFileException> | null,
    stdout: Readonly<Buffer> | string,
    stderr: Readonly<Buffer> | string
): void {
    if (error === null) {
        deferred.resolve({ stdout, stderr });
        return;
    }
    deferred.reject(error);
}

function reportClosedChildProcess(deferred: Deferred<never>): void {
    deferred.reject(new Error('Child process closed before reporting output'));
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
    return async function (command, args) {
        const output = Promise.withResolvers<GitCommandExecutorResult>();
        const closed = Promise.withResolvers<never>();
        const callback: ExecFileCallback = function (error, stdout, stderr) {
            reportExecFileResult(output, error, stdout, stderr);
        };
        const childProcess = spawnGitCommand(command, Array.from(args), callback);
        childProcess.once('close', function () {
            reportClosedChildProcess(closed);
        });
        return await runUntilOutputOrClose(output, closed);
    };
}

export function spawnChildProcessGitCommand(
    command: string,
    args: readonly string[],
    callback: ExecFileCallback
): GitCommandChildProcess {
    return execFile(command, Array.from(args), callback);
}
