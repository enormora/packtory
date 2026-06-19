/* eslint-disable import/max-dependencies -- the CLI runner wires five subcommands plus shared dependencies */
import { binary, command, flag, oneOf, option, positional, runSafely, string, subcommands } from 'cmd-ts';
import type { PrLogEngine, PrLogEngineOptions } from '@pr-log/core';
import type { FileManager } from '../../file-manager/file-manager.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import type { ProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runChangelogHandler } from './changelog-handler.ts';
import { getParseExitCode } from './command-parsing.ts';
import { runPackHandler } from './pack-handler.ts';
import { runPreviewHandler } from './preview-handler.ts';
import { runReleaseDiffHandler } from './release-diff-handler.ts';
import { registerProgressListeners } from './progress-wiring.ts';
import { runPublishHandler } from './publish-handler.ts';

export type CommandLineInterfaceRunnerDependencies = {
    readonly createPrLogEngine: (options: Readonly<PrLogEngineOptions>) => PrLogEngine;
    readonly currentDate: () => Date;
    readonly packtory: Packtory;
    readonly progressBroadcaster: ProgressBroadcastConsumer;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly openFile: (filePath: string) => Promise<boolean>;
    readonly createTemporaryFilePath: () => string;
    readonly readEnvironmentVariable: (name: 'GH_TOKEN' | 'GITHUB_TOKEN') => string | undefined;
    readonly readPackageInfo: () => Promise<Record<string, unknown>>;
    readonly workingDirectory: string;
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
        createTemporaryFilePath,
        createPrLogEngine,
        currentDate,
        readEnvironmentVariable,
        readPackageInfo,
        workingDirectory
    } = dependencies;
    let exitCode = 0;
    const publishCommandName = 'publish';
    const previewCommandName = 'preview';
    const releaseDiffCommandName = 'release-diff';
    const changelogCommandName = 'changelog';
    const packCommandName = 'pack';
    const defaultPackVersion = '0.0.0';
    const baseCommand = subcommands({
        name: 'packtory',
        cmds: {
            [publishCommandName]: command({
                name: publishCommandName,
                description: 'Builds and publishes all packages (dry-run enabled by default).',
                args: {
                    noDryRun: flag({ long: 'no-dry-run' }),
                    stage: flag({ long: 'stage' }),
                    reportJson: flag({ long: 'report-json' }),
                    reportHtml: flag({ long: 'report-html' })
                },
                async handler({ noDryRun, stage, reportJson, reportHtml }) {
                    exitCode = await runPublishHandler({
                        log,
                        packtory,
                        spinnerRenderer,
                        configLoader,
                        fileManager,
                        flags: { noDryRun, stage, reportJson, reportHtml }
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
            }),
            [changelogCommandName]: command({
                name: changelogCommandName,
                description: 'Generates grouped Markdown changelog output for the next release.',
                args: {},
                async handler() {
                    exitCode = await runChangelogHandler({
                        log,
                        pageOutput,
                        packtory,
                        spinnerRenderer,
                        configLoader,
                        fileManager,
                        createPrLogEngine,
                        currentDate,
                        readEnvironmentVariable,
                        readPackageInfo,
                        workingDirectory
                    });
                }
            }),
            [packCommandName]: command({
                name: packCommandName,
                description: 'Builds a single configured package and writes it as a zip, tar, or folder artifact.',
                args: {
                    packageName: positional({ type: string, displayName: 'package' }),
                    format: option({ long: 'format', type: oneOf(['zip', 'tar', 'folder']) }),
                    outputPath: option({ long: 'out', type: string }),
                    version: option({
                        long: 'version',
                        type: string,
                        defaultValue: () => {
                            return defaultPackVersion;
                        }
                    }),
                    vendorDependencies: flag({ long: 'vendor-dependencies' })
                },
                async handler({ packageName, format, outputPath, version, vendorDependencies }) {
                    exitCode = await runPackHandler({
                        log,
                        packtory,
                        spinnerRenderer,
                        configLoader,
                        flags: { packageName, format, outputPath, version, vendorDependencies }
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
