#!/usr/bin/env node

import { Spinner } from '@topcli/spinner';
import { createCommandLineInterfaceRunner } from '../../command-line-interface/runner.ts';
import { createTerminalSpinnerRenderer } from '../../command-line-interface/terminal-spinner-renderer.ts';
import { createConfigLoader } from '../../command-line-interface/config-loader.ts';
import { buildAndPublishAll, resolveAndLinkAll, progressBroadcastConsumer } from '../packtory/packtory.entry-point.ts';

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

const commandLinerInterfaceRunner = createCommandLineInterfaceRunner({
    packtory: { buildAndPublishAll, resolveAndLinkAll },
    progressBroadcaster: progressBroadcastConsumer,
    spinnerRenderer: createTerminalSpinnerRenderer({ SpinnerClass: Spinner }),
    configLoader: createConfigLoader({ currentWorkingDirectory: process.cwd(), importModule }),
    log: console.log
});

async function main(): Promise<void> {
    const exitCode = await commandLinerInterfaceRunner.run(process.argv);
    // eslint-disable-next-line require-atomic-updates -- we intentionally want to override the exitCode no matter what its current value is
    process.exitCode = exitCode;
}

function crash(error: unknown): void {
    console.error(error);
    process.exitCode = 1;
}

main().catch(crash);

export type { PacktoryConfig } from '../packtory/packtory.entry-point.js';
