import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

type RunDetachedCommandOptions = {
    readonly command: string;
    readonly args: readonly string[];
};

function spawnForCompletion(command: string, args: readonly string[], content: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const child = spawn(command, args, {
            stdio: ['pipe', 'inherit', 'inherit']
        });
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

function spawnDetached(options: RunDetachedCommandOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const child = spawn(options.command, options.args, {
            detached: true,
            stdio: 'ignore'
        });
        child.on('error', () => {
            resolve(false);
        });
        child.unref();
        resolve(true);
    });
}

export function createTemporaryPreviewHtmlPath(): string {
    return path.join(os.tmpdir(), `packtory-preview-${randomUUID()}.html`);
}

export async function pagePreviewOutput(content: string): Promise<boolean> {
    const pager = process.env.PAGER;
    if (process.stdout.isTTY !== true) {
        return false;
    }
    if (pager !== undefined && pager !== '') {
        const didPage = await spawnForCompletion(process.env.SHELL ?? 'sh', ['-lc', pager], content);
        if (didPage) {
            return true;
        }
    }
    return spawnForCompletion(process.env.SHELL ?? 'sh', ['-lc', 'less -R'], content);
}

export function openPreviewFile(filePath: string): Promise<boolean> {
    if (process.platform === 'darwin') {
        return spawnDetached({ command: 'open', args: [filePath] });
    }
    if (process.platform === 'win32') {
        return spawnDetached({ command: 'cmd', args: ['/c', 'start', '', filePath] });
    }
    return spawnDetached({ command: 'xdg-open', args: [filePath] });
}
