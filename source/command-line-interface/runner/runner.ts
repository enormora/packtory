/* eslint-disable import/max-dependencies -- the CLI runner wires three subcommands plus shared dependencies */
import { binary, command, flag, runSafely, subcommands } from 'cmd-ts';
import type { FileManager } from '../../file-manager/file-manager.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import type { ProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { getParseExitCode } from './command-parsing.ts';
import { runPreviewHandler } from './preview-handler.ts';
import { runReleaseDiffHandler } from './release-diff-handler.ts';
import { registerProgressListeners } from './progress-wiring.ts';
import { runPublishHandler } from './publish-handler.ts';

export type CommandLineInterfaceRunnerDependencies = {
    readonly packtory: Packtory;
    readonly progressBroadcaster: ProgressBroadcastConsumer;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly openFile: (filePath: string) => Promise<boolean>;
    readonly createTemporaryFilePath: () => string;
    log: (message: string) => void;
};

export type CommandLineInterfaceRunner = {
    run: (programArguments: readonly string[]) => Promise<number>;
};

export function createCommandLineInterfaceRunner(
    dependencies: CommandLineInterfaceRunnerDependencies
): CommandLineInterfaceRunner {
    const {
        log,
        packtory,
        progressBroadcaster,
        spinnerRenderer,
        configLoader,
        fileManager,
        pageOutput,
        openFile,
        createTemporaryFilePath
    } = dependencies;
    let exitCode = 0;
    const publishCommandName = 'publish';
    const previewCommandName = 'preview';
    const releaseDiffCommandName = 'release-diff';
    const baseCommand = subcommands({
        name: 'packtory',
        cmds: {
            [publishCommandName]: command({
                name: publishCommandName,
                description: 'Builds and publishes all packages (dry-run enabled by default).',
                args: {
                    noDryRun: flag({ long: 'no-dry-run' }),
                    reportJson: flag({ long: 'report-json' }),
                    reportHtml: flag({ long: 'report-html' })
                },
                async handler({ noDryRun, reportJson, reportHtml }) {
                    exitCode = await runPublishHandler({
                        log,
                        packtory,
                        spinnerRenderer,
                        configLoader,
                        fileManager,
                        flags: { noDryRun, reportJson, reportHtml }
                    });
                }
            }),
            [previewCommandName]: command({
                name: previewCommandName,
                description: 'Builds all packages in fresh dry-run mode and opens a human preview.',
                args: { open: flag({ long: 'open' }) },
                async handler({ open }) {
                    exitCode = await runPreviewHandler({
                        log,
                        pageOutput,
                        openFile,
                        createTemporaryFilePath,
                        packtory,
                        spinnerRenderer,
                        configLoader,
                        fileManager,
                        flags: { open }
                    });
                }
            }),
            [releaseDiffCommandName]: command({
                name: releaseDiffCommandName,
                description: 'Compares the next dry-run build against the latest published version, per package.',
                args: {},
                async handler() {
                    exitCode = await runReleaseDiffHandler({
                        log,
                        pageOutput,
                        packtory,
                        spinnerRenderer,
                        configLoader
                    });
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

            return parseExitCode ?? exitCode;
        }
    };
}
