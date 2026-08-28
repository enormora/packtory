/* eslint-disable import/max-dependencies -- the CLI runner wires command routing plus shared dependencies */
import {
    binary,
    command,
    flag,
    oneOf,
    option,
    optional as optionalType,
    positional,
    runSafely,
    string,
    subcommands
} from 'cmd-ts';
import type { PrLogEngine, PrLogEngineOptions } from '@pr-log/core';
import type { FileManager } from '../../file-manager/file-manager.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import type { ProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runChangelogHandler } from './changelog-handler.ts';
import { getParseExitCode } from './command-parsing.ts';
import { runConfigInspectHandler } from './config-inspect-handler.ts';
import { runPackHandler } from './pack-handler.ts';
import { runPackageDependenciesHandler } from './package-dependencies-handler.ts';
import { runPackageSideEffectsHandler } from './package-side-effects-handler.ts';
import { runPackageTreeHandler } from './package-tree-handler.ts';
import { runPreviewHandler } from './preview-handler.ts';
import { runReleaseDiffHandler } from './release-diff-handler.ts';
import type { GitHubReleaseClient } from './github-release-client.ts';
import { runReleaseHandler } from './release-handler.ts';
import { registerProgressListeners } from './progress-wiring.ts';
import { runPublishHandler } from './publish-handler.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';
import { runReleasePullRequestHandler } from './release-pull-request-handler.ts';
import { formatTerminalError, formatTerminalErrorTrace } from './terminal-error-chain.ts';

type ReleasePullRequestGitHubClientContext = {
    readonly apiBaseUrl: string;
    readonly owner: string;
    readonly repo: string;
    readonly token: string | undefined;
};
type GitHubReleaseClientContext = {
    readonly owner: string;
    readonly repo: string;
    readonly token: string;
};
type PreparedProgramArguments = {
    readonly arguments: readonly string[];
    readonly rootHelp: boolean;
    readonly trace: boolean;
};

export type CommandLineInterfaceRunnerDependencies = {
    readonly createPrLogEngine: (options: Readonly<PrLogEngineOptions>) => PrLogEngine;
    readonly createGitHubReleaseClient: (context: GitHubReleaseClientContext) => GitHubReleaseClient;
    readonly createReleasePullRequestGitHubClient: (
        context: ReleasePullRequestGitHubClientContext
    ) => ReleasePullRequestGitHubClient;
    readonly currentDate: () => Date;
    readonly packtory: Packtory;
    readonly progressBroadcaster: ProgressBroadcastConsumer;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly openFile: (filePath: string) => Promise<boolean>;
    readonly createTemporaryFilePath: () => string;
    readonly readEnvironmentVariable: (name: string) => string | undefined;
    readonly readPackageInfo: () => Promise<Readonly<Record<string, unknown>>>;
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly workingDirectory: string;
    log: (message: string) => void;
};

export type CommandLineInterfaceRunner = {
    run: (programArguments: readonly string[]) => Promise<number>;
};

const publishCommandName = 'publish';
const previewCommandName = 'preview';
const releaseCommandName = 'release';
const releaseDiffCommandName = 'release-diff';
const releasePullRequestCommandName = 'release-pr';
const authorizePublishReleasePullRequestCommandName = 'authorize-publish';
const changelogCommandName = 'changelog';
const configCommandName = 'config';
const dependenciesInspectCommandName = 'dependencies';
const inspectCommandName = 'inspect';
const inspectConfigCommandName = 'inspect';
const maintainReleasePullRequestCommandName = 'maintain';
const packCommandName = 'pack';
const sideEffectsInspectCommandName = 'side-effects';
const treeCommandName = 'tree';
const validateReleasePullRequestCommandName = 'validate';
const defaultPackVersion = '0.0.0';
const traceFlag = '--trace';
const traceHelpText = '  --trace  print stack traces for errors';
const commandArgumentOffset = 2;
const firstCommandArgumentIndex = 2;
const firstArgumentAfterTraceIndex = 3;

function isRootHelpRequest(programArguments: readonly string[]): boolean {
    const commandArguments = programArguments.slice(commandArgumentOffset);
    return commandArguments.length === 0 || commandArguments[0] === '--help' || commandArguments[0] === '-h';
}

function prepareProgramArguments(programArguments: readonly string[]): PreparedProgramArguments {
    const trace = programArguments[firstCommandArgumentIndex] === traceFlag;
    const preparedArguments = trace
        ? [
            ...programArguments.slice(0, commandArgumentOffset),
            ...programArguments.slice(firstArgumentAfterTraceIndex)
        ]
        : Array.from(programArguments);
    return {
        arguments: preparedArguments,
        rootHelp: isRootHelpRequest(preparedArguments),
        trace
    };
}

function addTraceHelp(message: string): string {
    return `${message}\n${traceHelpText}`;
}

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function formatUnexpectedError(error: unknown): string {
    return formatTerminalError(toError(error));
}

function formatUnexpectedTrace(error: unknown): string {
    return formatTerminalErrorTrace(toError(error));
}

function createParseLogger(log: (message: string) => void, rootHelp: boolean): (message: string) => void {
    return function logParseMessage(message) {
        log(rootHelp ? addTraceHelp(message) : message);
    };
}

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
        createGitHubReleaseClient,
        createReleasePullRequestGitHubClient,
        createPrLogEngine,
        currentDate,
        readEnvironmentVariable,
        readPackageInfo,
        sleep,
        workingDirectory
    } = dependencies;
    let exitCode = 0;
    let traceEnabled = Boolean();
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
                        flags: { noDryRun, stage, reportJson, reportHtml, trace: traceEnabled }
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
                args: {
                    filesOnly: flag({ long: 'files-only' })
                },
                async handler({ filesOnly }) {
                    exitCode = await runReleaseDiffHandler({
                        log,
                        pageOutput,
                        packtory,
                        spinnerRenderer,
                        configLoader,
                        flags: { filesOnly }
                    });
                }
            }),
            [releaseCommandName]: command({
                name: releaseCommandName,
                description: 'Publishes packages and creates release tags through the GitHub API.',
                args: {
                    publish: flag({ long: 'publish' }),
                    tag: flag({ long: 'tag' }),
                    push: flag({ long: 'push' }),
                    githubRelease: flag({ long: 'github-release' }),
                    noDryRun: flag({ long: 'no-dry-run' })
                },
                async handler({ publish, tag, push, githubRelease, noDryRun }) {
                    exitCode = await runReleaseHandler({
                        log,
                        packtory,
                        spinnerRenderer,
                        configLoader,
                        fileManager,
                        createPrLogEngine,
                        createGitHubReleaseClient,
                        currentDate,
                        readEnvironmentVariable,
                        readPackageInfo,
                        workingDirectory,
                        flags: { publish, tag, push, githubRelease, noDryRun },
                        trace: traceEnabled
                    });
                }
            }),
            [releasePullRequestCommandName]: subcommands({
                name: releasePullRequestCommandName,
                cmds: {
                    [maintainReleasePullRequestCommandName]: command({
                        name: maintainReleasePullRequestCommandName,
                        description: 'Creates or updates the generated release PR.',
                        args: {
                            noDryRun: flag({ long: 'no-dry-run' })
                        },
                        async handler({ noDryRun }) {
                            exitCode = await runReleasePullRequestHandler({
                                log,
                                packtory,
                                spinnerRenderer,
                                configLoader,
                                fileManager,
                                createPrLogEngine,
                                createReleasePullRequestGitHubClient,
                                currentDate,
                                readEnvironmentVariable,
                                readPackageInfo,
                                workingDirectory,
                                sleep,
                                trace: traceEnabled,
                                flags: {
                                    command: maintainReleasePullRequestCommandName,
                                    noDryRun,
                                    releasePullRequestNumber: undefined
                                }
                            });
                        }
                    }),
                    [validateReleasePullRequestCommandName]: command({
                        name: validateReleasePullRequestCommandName,
                        description: 'Validates the release PR policy for the current GitHub event.',
                        args: {},
                        async handler() {
                            exitCode = await runReleasePullRequestHandler({
                                log,
                                packtory,
                                spinnerRenderer,
                                configLoader,
                                fileManager,
                                createPrLogEngine,
                                createReleasePullRequestGitHubClient,
                                currentDate,
                                readEnvironmentVariable,
                                readPackageInfo,
                                workingDirectory,
                                sleep,
                                trace: traceEnabled,
                                flags: {
                                    command: validateReleasePullRequestCommandName,
                                    releasePullRequestNumber: undefined
                                }
                            });
                        }
                    }),
                    [authorizePublishReleasePullRequestCommandName]: command({
                        name: authorizePublishReleasePullRequestCommandName,
                        description: 'Authorizes publishing from a merged release PR.',
                        args: {
                            releasePullRequestNumber: option({
                                long: 'release-pull-request',
                                type: optionalType(string)
                            })
                        },
                        async handler({ releasePullRequestNumber }) {
                            exitCode = await runReleasePullRequestHandler({
                                log,
                                packtory,
                                spinnerRenderer,
                                configLoader,
                                fileManager,
                                createPrLogEngine,
                                createReleasePullRequestGitHubClient,
                                currentDate,
                                readEnvironmentVariable,
                                readPackageInfo,
                                workingDirectory,
                                sleep,
                                trace: traceEnabled,
                                flags: {
                                    command: authorizePublishReleasePullRequestCommandName,
                                    releasePullRequestNumber
                                }
                            });
                        }
                    })
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
                        workingDirectory,
                        trace: traceEnabled
                    });
                }
            }),
            [configCommandName]: subcommands({
                name: configCommandName,
                cmds: {
                    [inspectConfigCommandName]: command({
                        name: inspectConfigCommandName,
                        description: 'Validates packtory.config.js and prints a compact package summary.',
                        args: {},
                        async handler() {
                            exitCode = await runConfigInspectHandler({
                                log,
                                spinnerRenderer,
                                configLoader
                            });
                        }
                    })
                }
            }),
            [inspectCommandName]: subcommands({
                name: inspectCommandName,
                cmds: {
                    [dependenciesInspectCommandName]: command({
                        name: dependenciesInspectCommandName,
                        description: 'Prints why final manifest dependencies are emitted for one package.',
                        args: {
                            packageName: positional({ type: string, displayName: 'package' })
                        },
                        async handler({ packageName }) {
                            exitCode = await runPackageDependenciesHandler({
                                log,
                                packtory,
                                spinnerRenderer,
                                configLoader,
                                flags: { packageName, trace: traceEnabled }
                            });
                        }
                    }),
                    [sideEffectsInspectCommandName]: command({
                        name: sideEffectsInspectCommandName,
                        description: 'Prints why package.json sideEffects is false, listed, or omitted.',
                        args: {
                            packageName: positional({ type: string, displayName: 'package' })
                        },
                        async handler({ packageName }) {
                            exitCode = await runPackageSideEffectsHandler({
                                log,
                                packtory,
                                spinnerRenderer,
                                configLoader,
                                flags: { packageName, trace: traceEnabled }
                            });
                        }
                    })
                }
            }),
            [packCommandName]: command({
                name: packCommandName,
                description: 'Builds one package or all packages and writes artifacts to disk.',
                args: {
                    packageName: positional({ type: optionalType(string), displayName: 'package' }),
                    all: flag({ long: 'all' }),
                    format: option({ long: 'format', type: oneOf([ 'zip', 'tar', 'folder' ]) }),
                    outputPath: option({ long: 'out', type: string }),
                    version: option({
                        long: 'version',
                        type: string,
                        defaultValue() {
                            return defaultPackVersion;
                        }
                    }),
                    vendorDependencies: flag({ long: 'vendor-dependencies' })
                },
                async handler({ packageName, all, format, outputPath, version, vendorDependencies }) {
                    exitCode = await runPackHandler({
                        log,
                        packtory,
                        spinnerRenderer,
                        configLoader,
                        flags: {
                            all,
                            packageName,
                            format,
                            outputPath,
                            version,
                            vendorDependencies,
                            trace: traceEnabled
                        }
                    });
                }
            }),
            [treeCommandName]: command({
                name: treeCommandName,
                description: 'Prints the local artifact tree for a single configured package.',
                args: {
                    packageName: positional({ type: string, displayName: 'package' })
                },
                async handler({ packageName }) {
                    exitCode = await runPackageTreeHandler({
                        log,
                        packtory,
                        spinnerRenderer,
                        configLoader,
                        flags: { packageName, trace: traceEnabled }
                    });
                }
            })
        }
    });

    async function runPreparedCommand(
        preparedProgramArguments: PreparedProgramArguments,
        logParseMessage: (message: string) => void
    ): Promise<number> {
        const parseExitCode = getParseExitCode(
            logParseMessage,
            await runSafely(binary(baseCommand), Array.from(preparedProgramArguments.arguments))
        );
        return parseExitCode ?? exitCode;
    }

    return {
        async run(programArguments) {
            exitCode = 0;
            const preparedProgramArguments = prepareProgramArguments(programArguments);
            traceEnabled = preparedProgramArguments.trace;
            const logParseMessage = createParseLogger(log, preparedProgramArguments.rootHelp);
            registerProgressListeners(progressBroadcaster, spinnerRenderer);

            try {
                return await runPreparedCommand(preparedProgramArguments, logParseMessage);
            } catch (error: unknown) {
                const formatError = traceEnabled ? formatUnexpectedTrace : formatUnexpectedError;
                log(formatError(error));
                return 1;
            }
        }
    };
}
