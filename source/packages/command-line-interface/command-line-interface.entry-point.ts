#!/usr/bin/env node

import fileSystem from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createPrLogEngine as createLibraryEngine } from '@pr-log/core';
import { isTerminal } from '../../common/terminal.ts';
import { createPullRequestLogEngineFactory } from '../../changelog/pull-request-log.ts';
import { createClock } from '../../common/clock.ts';
import { createLineSpinnerRenderer } from '../../command-line-interface/spinner/line-spinner-renderer.ts';
import { createOneTimePasswordPrompt } from '../../command-line-interface/one-time-password-prompt.ts';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { createCommandLineInterfaceRunner } from '../../command-line-interface/runner/runner.ts';
import {
    createTerminalSpinnerRenderer,
    type TerminalSpinnerRenderer
} from '../../command-line-interface/spinner/terminal-spinner-renderer.ts';
import { createWorkerSpinnerBackend } from '../../command-line-interface/spinner/spinner-worker-backend.ts';
import { createConfigurationLoader } from '../../command-line-interface/configuration-loader.ts';
import * as preview from '../../command-line-interface/preview-input-output/preview-input-output.ts';
import { createGitHubReleaseClient } from '../../command-line-interface/runner/github-release-client.ts';
import type {
    CommandLineInterfacePacktoryConfiguration
} from '../../command-line-interface/runner/release-pull-request-configuration.ts';
import * as releaseGitHub from '../../command-line-interface/runner/release-pull-request-github-client.ts';
import { readContinuousIntegrationEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import { buildPacktoryComposition } from '../packtory.composition.ts';
import { createPullRequestLabelVersionSourceResolver } from './pull-request-label-versioning.ts';
import { awaitSpinnerWorkerTermination, createBootedSpinnerRuntime } from './spinner-boot.entry-point.ts';

const createPullRequestLogEngine = createPullRequestLogEngineFactory(createLibraryEngine);

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

function isPackageInformation(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePackageInformation(content: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(content);
    if (isPackageInformation(parsed)) {
        return parsed;
    }
    throw new Error('package.json must contain an object');
}

function createSpinnerRenderer(): TerminalSpinnerRenderer {
    if (!isTerminal(process.stdout)) {
        return createLineSpinnerRenderer({ log: console.log });
    }

    return createTerminalSpinnerRenderer({
        backend: createWorkerSpinnerBackend({ runtime: createBootedSpinnerRuntime() })
    });
}

const spinnerRenderer = createSpinnerRenderer();
const clock = createClock();
const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });
const workingDirectory = process.cwd();
const previewInputOutput = preview.createDefaultPreviewInputOutput({
    async openFile(filePath) {
        const { default: open } = await import('open');
        await open(filePath, { wait: false });
    },
    shell: process.env.SHELL,
    pager: process.env.PAGER,
    standardOutputIsTerminal: isTerminal(process.stdout)
});

const promptForOneTimePassword = createOneTimePasswordPrompt({
    clock,
    isInteractiveTerminal() {
        return isTerminal(process.stdin) && isTerminal(process.stdout);
    },
    stopSpinner() {
        spinnerRenderer.stopAll();
    },
    createInterface() {
        return readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }
});

async function readPackageInformation(): Promise<Record<string, unknown>> {
    return parsePackageInformation(await fileManager.readFile(path.join(workingDirectory, 'package.json')));
}

const { packtory, progressBroadcaster } = buildPacktoryComposition({
    promptForOneTimePassword,
    continuousIntegrationEnvironment: readContinuousIntegrationEnvironment(process.env),
    resolveVersionSource: createPullRequestLabelVersionSourceResolver({
        createPullRequestLogEngine,
        readEnvironmentVariable(name) {
            return process.env[name];
        },
        readPackageInformation,
        workingDirectory
    })
});

const commandLinerInterfaceRunner = createCommandLineInterfaceRunner({
    createPullRequestLogEngine,
    createGitHubReleaseClient(context) {
        return createGitHubReleaseClient({ ...context, fetch });
    },
    createReleasePullRequestGitHubClient(context) {
        return releaseGitHub.createReleasePullRequestGitHubClient({ ...context, fetch });
    },
    currentDate() {
        return new Date(clock.getCurrentTimeInMilliseconds());
    },
    packtory,
    progressBroadcaster: progressBroadcaster.consumer,
    spinnerRenderer,
    configurationLoader: createConfigurationLoader({ currentWorkingDirectory: workingDirectory, importModule }),
    fileManager,
    async pageOutput(content) {
        const didPage = await previewInputOutput.pagePreviewOutput(content);
        if (!didPage) {
            console.log(content);
        }
    },
    openFile: previewInputOutput.openPreviewFile,
    createTemporaryFilePath: previewInputOutput.createTemporaryPreviewHypertextMarkupLanguagePath,
    readEnvironmentVariable(name) {
        return process.env[name];
    },
    readPackageInformation,
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

// eslint-disable-next-line unicorn/no-exports-in-scripts -- public CLI package types are re-exported from this entry point
export type PacktoryConfiguration = CommandLineInterfacePacktoryConfiguration;
