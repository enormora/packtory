import { command, subcommands, flag, binary, runSafely } from 'cmd-ts';
import { bold, red, green, yellow, dim } from 'yoctocolors';
import type { Packtory, PublishFailure } from '../packtory/packtory.ts';
import type { ProgressBroadcastConsumer } from '../progress/progress-broadcaster.ts';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type { PartialError } from '../packtory/scheduler.ts';
import type { TerminalSpinnerRenderer } from './terminal-spinner-renderer.ts';
import type { ConfigLoader } from './config-loader.ts';

type PublishPartialError = PartialError<BuildAndPublishResult>;

export type CommandLineInterfaceRunnerDependencies = {
    readonly packtory: Packtory;
    readonly progressBroadcaster: ProgressBroadcastConsumer;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    log: (message: string) => void;
};

export type CommandLineInterfaceRunner = {
    run: (programArguments: readonly string[]) => Promise<number>;
};

type CommandParseResult = Awaited<ReturnType<typeof runSafely>>;

type PublishFlags = {
    noDryRun: boolean;
};

type CommandParseError = {
    readonly error: {
        readonly config: {
            readonly message: string;
            readonly exitCode: number;
        };
    };
};

function hasCommandParseError(result: CommandParseResult): result is CommandParseError & CommandParseResult {
    return 'error' in result;
}

function getErrorSymbol(): string {
    return bold(red('✖'));
}

function getSuccessSymbol(): string {
    return bold(green('✔'));
}

function getWarningSymbol(): string {
    return yellow('⚠');
}

function printDryRunNote(log: (message: string) => void, flags: PublishFlags): void {
    if (flags.noDryRun) {
        return;
    }

    log(
        `${getWarningSymbol()} ${dim(
            ` Note: dry-run mode was enabled, so there was nothing really published; add the ${bold(
                '--no-dry-run'
            )} flag to disable dry-run mode`
        )}`
    );
}

function printInvalidConfigErrors(log: (message: string) => void, issues: readonly string[]): void {
    const title = `${getErrorSymbol()} The provided config is invalid, there are ${issues.length} issue(s)`;
    const message = `${title}\n\n- ${issues.join('\n- ')}`;
    log(message);
}

function printCheckErrors(log: (message: string) => void, issues: readonly string[]): void {
    const title = `${getErrorSymbol()} Checks failed, there are ${issues.length} issue(s)`;
    const message = `${title}\n\n- ${issues.join('\n- ')}`;
    log(message);
}

function printPartialErrorSummary(log: (message: string) => void, error: PublishPartialError): void {
    const total = error.succeeded.length + error.failures.length;
    const failureCount = red(String(error.failures.length));
    const successCount = green(String(error.succeeded.length));
    log(`${getErrorSymbol()} ${failureCount} from ${bold(String(total))} package(s) failed; ${successCount} succeeded`);
}

function printPublishFailure(log: (message: string) => void, error: PublishFailure): void {
    if (error.type === 'config') {
        printInvalidConfigErrors(log, error.issues);
    } else if (error.type === 'checks') {
        printCheckErrors(log, error.issues);
    } else {
        printPartialErrorSummary(log, error);
    }
}

function printSuccessSummary(log: (message: string) => void, results: readonly BuildAndPublishResult[]): void {
    log(`${getSuccessSymbol()} Success: all ${results.length} package(s) have been published`);
}

function registerProgressListeners(
    progressBroadcaster: ProgressBroadcastConsumer,
    spinnerRenderer: TerminalSpinnerRenderer
): void {
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
        spinnerRenderer.updateMessage(payload.packageName, `Rebuilding package with version ${payload.version}`);
    });
}

function getParseExitCode(log: (message: string) => void, result: CommandParseResult): number | undefined {
    if (!hasCommandParseError(result)) {
        return undefined;
    }

    log(result.error.config.message);

    return result.error.config.exitCode;
}

export function createCommandLineInterfaceRunner(
    dependencies: CommandLineInterfaceRunnerDependencies
): CommandLineInterfaceRunner {
    const { log, packtory, progressBroadcaster, spinnerRenderer, configLoader } = dependencies;
    let exitCode = 0;
    const publishCommandName = 'publish';
    const baseCommand = subcommands({
        name: 'packtory',
        cmds: {
            [publishCommandName]: command({
                name: publishCommandName,
                description: 'Builds and publishes all packages (dry-run enabled by default).',
                args: {
                    noDryRun: flag({ long: 'no-dry-run' })
                },
                async handler({ noDryRun }) {
                    const config = await configLoader.load();

                    try {
                        const result = await packtory.buildAndPublishAll(config, { dryRun: !noDryRun });
                        spinnerRenderer.stopAll();

                        if (result.isErr) {
                            exitCode = 1;
                            printPublishFailure(log, result.error);
                        } else {
                            printSuccessSummary(log, result.value);
                        }
                    } finally {
                        spinnerRenderer.stopAll();
                        printDryRunNote(log, { noDryRun });
                    }
                }
            })
        }
    });

    return {
        async run(programArguments) {
            exitCode = 0;
            registerProgressListeners(progressBroadcaster, spinnerRenderer);

            const parseExitCode = getParseExitCode(
                log,
                await runSafely(binary(baseCommand), Array.from(programArguments))
            );

            if (parseExitCode !== undefined) {
                return parseExitCode;
            }

            return exitCode;
        }
    };
}
