import { spawn } from 'node:child_process';

export type SpawnedProcess = {
    readonly on: (eventName: 'close' | 'error', listener: (value?: number) => void) => void;
    readonly stdin: {
        readonly on: (eventName: 'error', listener: () => void) => void;
        readonly end: (content: string) => void;
    } | null;
    readonly unref: () => void;
};

export type SpawnOptions = {
    readonly stdio: readonly ['pipe', 'inherit', 'inherit'] | 'ignore';
    readonly detached?: boolean;
};

export type SpawnFunction = (command: string, args: readonly string[], options: SpawnOptions) => SpawnedProcess;

export function defaultSpawnProcess(command: string, args: readonly string[], options: SpawnOptions): SpawnedProcess {
    return spawn(command, Array.from(args), {
        ...options,
        stdio: options.stdio === 'ignore' ? 'ignore' : Array.from(options.stdio)
    });
}

export async function spawnForCompletion(
    spawnProcess: SpawnFunction,
    command: string,
    args: readonly string[],
    content: string
): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const child = spawnProcess(command, args, { stdio: ['pipe', 'inherit', 'inherit'] });
        if (child.stdin === null) {
            resolve(false);
            return;
        }
        child.on('error', () => {
            resolve(false);
        });
        child.on('close', (code) => {
            resolve(code === 0);
        });
        child.stdin.on('error', () => {
            resolve(false);
        });
        child.stdin.end(content);
    });
}

export async function spawnDetached(
    spawnProcess: SpawnFunction,
    command: string,
    args: readonly string[]
): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const child = spawnProcess(command, args, { detached: true, stdio: 'ignore' });
        child.on('error', () => {
            resolve(false);
        });
        child.unref();
        queueMicrotask(() => {
            resolve(true);
        });
    });
}
