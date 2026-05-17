#!/usr/bin/env node

import fs from 'node:fs';
import readline from 'node:readline/promises';
import { createClock } from '../../common/clock.ts';
import { createOneTimePasswordPrompt } from '../../command-line-interface/one-time-password-prompt.ts';
import type * as configTypes from '../../config/config.ts';
import { createCommandLineInterfaceRunner } from '../../command-line-interface/runner.ts';
import { createTerminalSpinnerRenderer } from '../../command-line-interface/terminal-spinner-renderer.ts';
import { createWorkerSpinnerBackend } from '../../command-line-interface/spinner-worker-backend.ts';
import { createConfigLoader } from '../../command-line-interface/config-loader.ts';
import { createDefaultPreviewIo } from '../../command-line-interface/preview-io.ts';
import { createPacktory } from '../../packtory/packtory.ts';
import { createScheduler } from '../../packtory/scheduler.ts';
import { readCiEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import { buildPackageProcessorComposition } from '../package-processor.composition.ts';
import { bootedSpinnerRuntime } from './spinner-boot.entry-point.ts';
import { createFileManager } from '../../file-manager/file-manager.ts';

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

const spinnerRenderer = createTerminalSpinnerRenderer({
    backend: createWorkerSpinnerBackend({ runtime: bootedSpinnerRuntime })
});
const clock = createClock();
const fileManager = createFileManager({ hostFileSystem: fs.promises });
const previewIo = createDefaultPreviewIo({
    platform: process.platform,
    // eslint-disable-next-line node/no-process-env -- preview pager/open behavior is intentionally driven by the caller environment
    shell: process.env.SHELL,
    // eslint-disable-next-line node/no-process-env -- preview pager/open behavior is intentionally driven by the caller environment
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

const { packageProcessor, progressBroadcaster, deadCodeEliminator } = buildPackageProcessorComposition({
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
    progressBroadcaster
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
}

function crash(error: unknown): void {
    console.error(error);
    process.exitCode = 1;
}

main().catch(crash);

export type PacktoryConfig = configTypes.PacktoryConfig;
