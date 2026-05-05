#!/usr/bin/env node

import { bootedSpinnerRuntime } from '../../command-line-interface/spinner-boot.entry-point.ts';
import type * as configTypes from '../../config/config.ts';
import { createCommandLineInterfaceRunner } from '../../command-line-interface/runner.ts';
import { createTerminalSpinnerRenderer } from '../../command-line-interface/terminal-spinner-renderer.ts';
import { createWorkerSpinnerBackend } from '../../command-line-interface/spinner-worker-backend.ts';
import { createConfigLoader } from '../../command-line-interface/config-loader.ts';
import { buildAndPublishAll, resolveAndLinkAll, progressBroadcastConsumer } from '../packtory/packtory.entry-point.ts';

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

const commandLinerInterfaceRunner = createCommandLineInterfaceRunner({
    packtory: { buildAndPublishAll, resolveAndLinkAll },
    progressBroadcaster: progressBroadcastConsumer,
    spinnerRenderer: createTerminalSpinnerRenderer({
        backend: createWorkerSpinnerBackend({ runtime: bootedSpinnerRuntime })
    }),
    configLoader: createConfigLoader({ currentWorkingDirectory: process.cwd(), importModule }),
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
