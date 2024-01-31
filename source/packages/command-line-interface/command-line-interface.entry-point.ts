import { Spinner } from '@topcli/spinner';
import { createCommandLineInterfaceRunner } from '../../command-line-interface/runner.js';
import { createTerminalSpinnerRenderer } from '../../command-line-interface/terminal-spinner-renderer.js';
import { createConfigLoader } from '../../command-line-interface/config-loader.js';
import { buildAndPublishAll, progressBroadcastConsumer } from '../packtory/packtory.entry-point.js';

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

const commandLinerInterfaceRunner = createCommandLineInterfaceRunner({
    packtory: { buildAndPublishAll },
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
