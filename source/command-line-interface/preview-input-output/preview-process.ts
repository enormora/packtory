import type { SpawnOptions as NativeSpawnOptions } from 'node:child_process';

type SpawnedProcess = {
    readonly on: (eventName: 'close' | 'error', listener: (value?: number) => void) => void;
    readonly standardInput: {
        readonly on: (eventName: 'error', listener: () => void) => void;
        readonly end: (content: string) => void;
    } | null;
    readonly unref: () => void;
};

type SpawnOptions = {
    readonly stdio: readonly ['pipe', 'inherit', 'inherit'] | 'ignore';
    readonly detached?: boolean;
};

export type SpawnFunction = (
    command: string,
    commandArguments: readonly string[],
    options: SpawnOptions
) => SpawnedProcess;

type ProcessHandle = {
    readonly stdin: SpawnedProcess['standardInput'];
    readonly on: SpawnedProcess['on'];
    readonly unref: SpawnedProcess['unref'];
};
type ProcessLauncher = (
    command: string,
    commandArguments: readonly string[],
    options: Readonly<NativeSpawnOptions>
) => ProcessHandle;

export function createPreviewProcessSpawner(launch: ProcessLauncher): SpawnFunction {
    return function (command, commandArguments, options) {
        const child = launch(command, Array.from(commandArguments), {
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
    };
}
