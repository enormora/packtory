#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createPrLogEngine } from '@pr-log/core';
import { createClock } from '../../common/clock.ts';
import { createLineSpinnerRenderer } from '../../command-line-interface/spinner/line-spinner-renderer.ts';
import { createOneTimePasswordPrompt } from '../../command-line-interface/one-time-password-prompt.ts';
import type { PacktoryConfig as PublicPacktoryConfig } from '../../config/config.ts';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { createCommandLineInterfaceRunner } from '../../command-line-interface/runner/runner.ts';
import {
    createTerminalSpinnerRenderer,
    type TerminalSpinnerRenderer
} from '../../command-line-interface/spinner/terminal-spinner-renderer.ts';
import { createWorkerSpinnerBackend } from '../../command-line-interface/spinner/spinner-worker-backend.ts';
import { createConfigLoader } from '../../command-line-interface/config-loader.ts';
import { createDefaultPreviewIo } from '../../command-line-interface/preview-io/preview-io.ts';
import { createGitHubReleaseClient } from '../../command-line-interface/runner/github-release-client.ts';
import { createReleasePullRequestGitHubClient } from '../../command-line-interface/runner/release-pr-github-client.ts';
import { createReleaseGitClient } from '../../command-line-interface/runner/release-git-client.ts';
import { readCiEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import { buildPacktoryComposition } from '../packtory.composition.ts';
import { awaitSpinnerWorkerTermination, createBootedSpinnerRuntime } from './spinner-boot.entry-point.ts';

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

function isPackageInfo(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePackageInfo(content: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(content);
    if (isPackageInfo(parsed)) {
        return parsed;
    }
    throw new Error('package.json must contain an object');
}

function createSpinnerRenderer(): TerminalSpinnerRenderer {
    if (!process.stdout.isTTY) {
        return createLineSpinnerRenderer({ log: console.log });
    }

    return createTerminalSpinnerRenderer({
        backend: createWorkerSpinnerBackend({ runtime: createBootedSpinnerRuntime() })
    });
}

async function runGitCommand(
    command: string,
    args: readonly string[]
): Promise<{
    readonly stdout: string;
    readonly stderr: string;
}> {
    return new Promise((resolve, reject) => {
        execFile(command, Array.from(args), (error, stdout, stderr) => {
            if (error !== null) {
                reject(error instanceof Error ? error : new Error('Git command failed'));
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

const spinnerRenderer = createSpinnerRenderer();
const clock = createClock();
const fileManager = createFileManager({ hostFileSystem: fs.promises });
const previewIo = createDefaultPreviewIo({
    async openFile(filePath) {
        const { default: open } = await import('open');
        await open(filePath, { wait: false });
    },
    shell: process.env.SHELL,
    pager: process.env.PAGER,
    stdoutIsTTY: process.stdout.isTTY
});

const promptForOneTimePassword = createOneTimePasswordPrompt({
    clock,
    isInteractiveTerminal: () => {
        return process.stdin.isTTY && process.stdout.isTTY;
    },
    stopSpinner: () => {
        spinnerRenderer.stopAll();
    },
    createInterface: () => {
        return readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }
});

const { packtory, progressBroadcaster } = buildPacktoryComposition({
    promptForOneTimePassword,
    ciEnvironment: readCiEnvironment(process.env)
});
const workingDirectory = process.cwd();

const commandLinerInterfaceRunner = createCommandLineInterfaceRunner({
    createPrLogEngine,
    createGitHubReleaseClient: (context) => {
        return createGitHubReleaseClient({ ...context, fetch: globalThis.fetch });
    },
    createReleasePullRequestGitHubClient: (context) => {
        return createReleasePullRequestGitHubClient({ ...context, fetch: globalThis.fetch });
    },
    currentDate() {
        return new Date(clock.getCurrentTimeInMilliseconds());
    },
    packtory,
    progressBroadcaster: progressBroadcaster.consumer,
    spinnerRenderer,
    configLoader: createConfigLoader({ currentWorkingDirectory: workingDirectory, importModule }),
    fileManager,
    pageOutput: async (content) => {
        const didPage = await previewIo.pagePreviewOutput(content);
        if (!didPage) {
            console.log(content);
        }
    },
    openFile: previewIo.openPreviewFile,
    createTemporaryFilePath: previewIo.createTemporaryPreviewHtmlPath,
    readEnvironmentVariable(name) {
        return process.env[name];
    },
    async readPackageInfo() {
        return parsePackageInfo(await fileManager.readFile(path.join(workingDirectory, 'package.json')));
    },
    releaseGitClient: createReleaseGitClient({ repositoryFolder: workingDirectory, runGitCommand }),
    async sleep(milliseconds) {
        await delay(milliseconds);
    },
    workingDirectory,
    log: console.log
});

function setExitCode(exitCode: number): void {
    process.exitCode = exitCode;
}

async function main(): Promise<void> {
    const exitCode = await commandLinerInterfaceRunner.run(process.argv);
    setExitCode(exitCode);
    spinnerRenderer.stopAll();
    await awaitSpinnerWorkerTermination();
}

async function crash(error: unknown): Promise<void> {
    spinnerRenderer.stopAll();
    console.error(error);
    process.exitCode = 1;
    await awaitSpinnerWorkerTermination();
}

main().catch(crash);

export type PacktoryConfig = PublicPacktoryConfig;
