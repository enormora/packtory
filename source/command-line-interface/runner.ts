import { command, subcommands, flag, binary, run } from 'cmd-ts';
import kleur from 'kleur';
import type { Packtory, PublishFailure } from '../packtory/packtory.js';
import type { ProgressBroadcastConsumer } from '../progress/progress-broadcaster.js';
import type { PartialError } from '../packtory/scheduler.js';
import type { PublishResult } from '../publisher/publisher.js';
import type { TerminalSpinnerRenderer } from './terminal-spinner-renderer.js';
import type { ConfigLoader } from './config-loader.js';

export type CommandLineInterfaceRunnerDependencies = {
    readonly packtory: Packtory;
    readonly progressBroadcaster: ProgressBroadcastConsumer;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    log(message: string): void;
};

export type CommandLineInterfaceRunner = {
    run(programArguments: readonly string[]): Promise<number>;
};

const errorSymbol = kleur.bold().red('✖');
const successSymbol = kleur.bold().green('✔');
const warningSymbol = kleur.yellow('⚠');

type PublishFlags = {
    noDryRun: boolean;
};

export function createCommandLineInterfaceRunner(
    dependencies: CommandLineInterfaceRunnerDependencies
): CommandLineInterfaceRunner {
    const { log, packtory, progressBroadcaster, spinnerRenderer, configLoader } = dependencies;
    let exitCode = 0;

    function printDryRunNote(flags: PublishFlags): void {
        if (flags.noDryRun) {
            return;
        }

        log(
            `${warningSymbol} ${kleur.dim(
                ` Note: dry-run mode was enabled, so there was nothing really published; add the ${kleur.bold(
                    '--no-dry-run'
                )} flag to disable dry-run mode`
            )}`
        );
    }
    function printInvalidConfigErrors(issues: readonly string[]): void {
        const title = `${errorSymbol} The provided config is invalid, there are ${issues.length} issue(s)`;
        const message = `${title}\n\n- ${issues.join('\n- ')}`;
        log(message);
    }

    function printPartialErrorSummary(error: PartialError): void {
        const total = error.succeeded.length + error.failures.length;
        log(
            `${errorSymbol} ${kleur.red(error.failures.length)} from ${kleur.bold(
                total
            )} package(s) failed; ${kleur.green(error.succeeded.length)} succeeded`
        );
    }

    function printPublishFailure(error: PublishFailure): void {
        if (error.type === 'config') {
            printInvalidConfigErrors(error.issues);
        } else {
            printPartialErrorSummary(error);
        }
    }

    function printSuccessSummary(results: readonly PublishResult[]): void {
        log(`${successSymbol} Success: all ${results.length} package(s) have been published`);
    }
    const baseCommand = subcommands({
        name: 'packtory',
        cmds: {
            publish: command({
                name: 'publish',
                description: 'Builds and publishes all packages (dry-run enabled by default).',
                args: {
                    noDryRun: flag({ long: 'no-dry-run' })
                },
                async handler({ noDryRun }) {
                    const config = await configLoader.load();

                    try {
                        const result = await packtory.buildAndPublishAll(config, { dryRun: !noDryRun });
                        if (result.isErr) {
                            exitCode = 1;
                            printPublishFailure(result.error);
                        } else {
                            printSuccessSummary(result.value);
                        }
                    } finally {
                        spinnerRenderer.stopAll();
                        printDryRunNote({ noDryRun });
                    }
                }
            })
        }
    });

    return {
        async run(programArguments) {
            progressBroadcaster.on('scheduled', (payload) => {
                spinnerRenderer.add(payload.packageName, payload.packageName, 'Scheduled …');
            });

            progressBroadcaster.on('error', (payload) => {
                spinnerRenderer.stop(payload.packageName, 'failure', payload.error.message);
            });

            progressBroadcaster.on('done', (payload) => {
                let message = `New version ${payload.version} published`;

                if (payload.status === 'already-published') {
                    message = `Nothing has changed, published version ${payload.version} is already up-to-date`;
                }

                if (payload.status === 'initial-version') {
                    message = `First version ${payload.version} has been published`;
                }

                spinnerRenderer.stop(payload.packageName, 'success', message);
            });

            progressBroadcaster.on('building', (payload) => {
                spinnerRenderer.updateMessage(payload.packageName, `Building package with version ${payload.version}`);
            });

            progressBroadcaster.on('rebuilding', (payload) => {
                spinnerRenderer.updateMessage(
                    payload.packageName,
                    `Rebuilding package with version ${payload.version}`
                );
            });

            const program = binary(baseCommand);
            await run(program, programArguments as string[]);

            return exitCode;
        }
    };
}
