/* eslint-disable no-undef -- the NodeJS namespace type is used for portable platform detection */
import { spawn } from 'node:child_process';
import path from 'node:path';

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

type SpawnFunction = (command: string, args: readonly string[], options: SpawnOptions) => SpawnedProcess;

export type PreviewIoDependencies = {
    readonly spawnProcess: SpawnFunction;
    readonly randomUuid: () => string;
    readonly tmpdir: () => string;
    readonly platform: NodeJS.Platform;
    readonly shell: string | undefined;
    readonly pager: string | undefined;
    readonly stdoutIsTTY: boolean;
};

export type PreviewIo = {
    readonly createTemporaryPreviewHtmlPath: () => string;
    readonly pagePreviewOutput: (content: string) => Promise<boolean>;
    readonly openPreviewFile: (filePath: string) => Promise<boolean>;
};

type RunDetachedCommandOptions = {
    readonly command: string;
    readonly args: readonly string[];
};

export function defaultSpawnProcess(command: string, args: readonly string[], options: SpawnOptions): SpawnedProcess {
    return spawn(command, Array.from(args), {
        ...options,
        stdio: options.stdio === 'ignore' ? 'ignore' : Array.from(options.stdio)
    });
}

export function createPreviewIo(dependencies: PreviewIoDependencies): PreviewIo {
    const shell = dependencies.shell ?? 'sh';

    async function spawnForCompletion(command: string, args: readonly string[], content: string): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const child = dependencies.spawnProcess(command, args, {
                stdio: ['pipe', 'inherit', 'inherit']
            });
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

    async function spawnDetached(options: RunDetachedCommandOptions): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const child = dependencies.spawnProcess(options.command, options.args, {
                detached: true,
                stdio: 'ignore'
            });
            child.on('error', () => {
                resolve(false);
            });
            child.unref();
            queueMicrotask(() => {
                resolve(true);
            });
        });
    }

    return {
        createTemporaryPreviewHtmlPath() {
            return path.join(dependencies.tmpdir(), `packtory-preview-${dependencies.randomUuid()}.html`);
        },
        async pagePreviewOutput(content) {
            if (!dependencies.stdoutIsTTY) {
                return false;
            }
            if (dependencies.pager !== undefined && dependencies.pager !== '') {
                const didPage = await spawnForCompletion(shell, ['-lc', dependencies.pager], content);
                if (didPage) {
                    return true;
                }
            }
            return spawnForCompletion(shell, ['-lc', 'less -R'], content);
        },
        async openPreviewFile(filePath) {
            if (dependencies.platform === 'darwin') {
                return spawnDetached({ command: 'open', args: [filePath] });
            }
            if (dependencies.platform === 'win32') {
                return spawnDetached({ command: 'cmd', args: ['/c', 'start', '', filePath] });
            }
            return spawnDetached({ command: 'xdg-open', args: [filePath] });
        }
    };
}
