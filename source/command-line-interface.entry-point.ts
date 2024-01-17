import fs from 'node:fs';
import npmFetch from 'npm-registry-fetch';
import { publish } from 'libnpmpublish';
import { Spinner } from '@topcli/spinner';
import { createFileManager } from './artifacts/file-manager.js';
import { createPublisher } from './publisher/publisher.js';
import { bundler } from './bundler.entry-point.js';
import { createRegistryClient } from './publisher/registry-client.js';
import { createArtifactsBuilder } from './artifacts/artifacts-builder.js';
import { createProgressBroadcaster } from './progress/progress-broadcaster.js';
import { createScheduler } from './packtory/scheduler.js';
import { createPacktory } from './packtory/packtory.js';
import { createCommandLineInterfaceRunner } from './command-line-interface/runner.js';
import { createTerminalSpinnerRenderer } from './command-line-interface/terminal-spinner-renderer.js';
import { createConfigLoader } from './command-line-interface/config-loader.js';

const fileManager = createFileManager({ hostFileSystem: fs.promises });
const registryClient = createRegistryClient({ npmFetch, publish });
const artifactsBuilder = createArtifactsBuilder({ fileManager });
const progressBroadcaster = createProgressBroadcaster();
const publisher = createPublisher({
    progressBroadcaster: progressBroadcaster.provider,
    bundler,
    registryClient,
    artifactsBuilder
});
const scheduler = createScheduler({
    progressBroadcastProvider: progressBroadcaster.provider
});
const packtory = createPacktory({
    scheduler,
    publisher
});

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

const commandLinerInterfaceRunner = createCommandLineInterfaceRunner({
    packtory,
    progressBroadcaster: progressBroadcaster.consumer,
    spinnerRenderer: createTerminalSpinnerRenderer({ SpinnerClass: Spinner }),
    configLoader: createConfigLoader({ currentWorkingDirectory: process.cwd(), importModule }),
    log: console.log
});

async function main(): Promise<void> {
    const exitCode = await commandLinerInterfaceRunner.run(process.argv);
    process.exitCode = exitCode;
}

function crash(error: unknown): void {
    console.error(error);
    process.exitCode = 1;
}

main().catch(crash);
