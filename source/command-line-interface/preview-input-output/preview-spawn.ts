import { spawn } from 'node:child_process';

export type SpawnedProcess = {
    readonly on: (eventName: 'close' | 'error', listener: (value?: number) => void) => void;
    readonly standardInput: {
        readonly on: (eventName: 'error', listener: () => void) => void;
        readonly end: (content: string) => void;
    } | null;
    readonly unref: () => void;
};

export type SpawnOptions = {
    readonly stdio: readonly ['pipe', 'inherit', 'inherit'] | 'ignore';
    readonly detached?: boolean;
};

export type SpawnFunction = (
    command: string,
    commandArguments: readonly string[],
    options: SpawnOptions
) => SpawnedProcess;

export function defaultSpawnProcess(
    command: string,
    commandArguments: readonly string[],
    options: SpawnOptions
): SpawnedProcess {
    const child = spawn(command, Array.from(commandArguments), {
        ...options,
        stdio: options.stdio === 'ignore' ? 'ignore' : Array.from(options.stdio)
    });
    return {
        standardInput: child.stdin,
        on(eventName, listener) {
            child.on(eventName, listener);
        },
        unref() {
            child.unref();
        }
    };
}

export async function spawnForCompletion(
    spawnProcess: SpawnFunction,
    command: string,
    commandArguments: readonly string[],
    content: string
): Promise<boolean> {
    return new Promise<boolean>(function (resolve) {
        const child = spawnProcess(command, commandArguments, { stdio: [ 'pipe', 'inherit', 'inherit' ] });
        if (child.standardInput === null) {
            resolve(false);
            return;
        }
        child.on('error', function () {
            resolve(false);
        });
        child.on('close', function (code) {
            resolve(code === 0);
        });
        child.standardInput.on('error', function () {
            resolve(false);
        });
        child.standardInput.end(content);
    });
}
