#!/usr/bin/env node

import fs from 'node:fs';
import readline from 'node:readline/promises';
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
import { createPacktory } from '../../packtory/packtory.ts';
import { createScheduler } from '../../packtory/scheduler.ts';
import { readCiEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import { buildPackageProcessorComposition } from '../package-processor.composition.ts';
import { awaitSpinnerWorkerTermination, createBootedSpinnerRuntime } from './spinner-boot.entry-point.ts';

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

function createSpinnerRenderer(): TerminalSpinnerRenderer {
    if (!process.stdout.isTTY) {
        return createLineSpinnerRenderer({ log: console.log });
    }

    return createTerminalSpinnerRenderer({
        backend: createWorkerSpinnerBackend({ runtime: createBootedSpinnerRuntime() })
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

const {
    packageProcessor,
    progressBroadcaster,
    deadCodeEliminator,
    artifactsBuilder,
    versionManager,
    packEmitter,
    vendorMaterializer
} = buildPackageProcessorComposition({
    promptForOneTimePassword,
    ciEnvironment: readCiEnvironment(process.env)
});
const scheduler = createScheduler({
    progressBroadcastProvider: progressBroadcaster.provider
});

const packtory = createPacktory({
    scheduler,
    packageProcessor,
    deadCodeEliminator,
    progressBroadcaster,
    artifactsBuilder,
    versionManager,
    packEmitter,
    vendorMaterializer
});

const commandLinerInterfaceRunner = createCommandLineInterfaceRunner({
    packtory,
    progressBroadcaster: progressBroadcaster.consumer,
    spinnerRenderer,
    configLoader: createConfigLoader({ currentWorkingDirectory: process.cwd(), importModule }),
    fileManager,
    pageOutput: async (content) => {
        const didPage = await previewIo.pagePreviewOutput(content);
        if (!didPage) {
            console.log(content);
        }
    },
    openFile: previewIo.openPreviewFile,
    createTemporaryFilePath: previewIo.createTemporaryPreviewHtmlPath,
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
