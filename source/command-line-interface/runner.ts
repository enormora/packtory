/* eslint-disable import/max-dependencies -- the CLI runner orchestrates command parsing, reporting, preview rendering, and progress wiring */
import { command, subcommands, flag, binary, runSafely } from 'cmd-ts';
import { bold, red, green, yellow, dim } from 'yoctocolors';
import type { BuildReport, Packtory } from '../packtory/packtory.ts';
import type { PublishFailure } from '../packtory/packtory-results.ts';
import type { ProgressBroadcastConsumer } from '../progress/progress-broadcaster.ts';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type { PartialError } from '../packtory/scheduler.ts';
import { buildPreviewDocument } from '../report/preview-document.ts';
import { renderHtmlReport } from '../report/html-renderer.ts';
import { renderFailureOnlyTerminalPreview, renderTerminalPreview } from '../report/terminal-preview-renderer.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { TerminalSpinnerRenderer } from './terminal-spinner-renderer.ts';
import type { ConfigLoader } from './config-loader.ts';

type PublishPartialError = PartialError<BuildAndPublishResult>;

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

type CommandParseResult = Awaited<ReturnType<typeof runSafely>>;

type PublishFlags = {
    noDryRun: boolean;
};

type PreviewFlags = {
    open: boolean;
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
    const summary =
        `${getErrorSymbol()} ${failureCount} from ${bold(String(total))} package(s) failed; ` +
        `${successCount} succeeded`;
    const details = error.failures.map((failure) => {
        return `- ${failure.message}`;
    });
    log([summary, ...details].join('\n'));
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

const jsonIndentSpaces = 2;

// eslint-disable-next-line @typescript-eslint/max-params -- report persistence needs shared flags plus build outcome/report data
async function writeReports(
    fileManager: Pick<FileManager, 'readFile' | 'writeFile'>,
    report: BuildReport | undefined,
    result: Awaited<ReturnType<Packtory['buildAndPublishAll']>>['result'],
    flags: { readonly reportJson: boolean; readonly reportHtml: boolean },
    dryRun: boolean
): Promise<void> {
    if (report === undefined) {
        return;
    }
    if (flags.reportJson) {
        await fileManager.writeFile('packtory-report.json', `${JSON.stringify(report, undefined, jsonIndentSpaces)}\n`);
    }
    if (flags.reportHtml) {
        const document = await buildPreviewDocument({ report, result, dryRun, fileManager });
        await fileManager.writeFile('packtory-report.html', renderHtmlReport(document));
    }
}

type PublishHandlerDeps = {
    readonly log: (message: string) => void;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly flags: { readonly noDryRun: boolean; readonly reportJson: boolean; readonly reportHtml: boolean };
};

async function reportOutcome(
    log: PublishHandlerDeps['log'],
    fileManager: PublishHandlerDeps['fileManager'],
    outcome: Awaited<ReturnType<Packtory['buildAndPublishAll']>>,
    flags: PublishHandlerDeps['flags']
): Promise<number> {
    let exitCode = 0;
    if (outcome.result.isErr) {
        exitCode = 1;
        printPublishFailure(log, outcome.result.error);
    } else {
        printSuccessSummary(log, outcome.result.value);
    }
    await writeReports(fileManager, outcome.getReport(), outcome.result, flags, !flags.noDryRun);
    return exitCode;
}

async function stopSpinnersAndReportOutcome(args: {
    readonly flags: PublishHandlerDeps['flags'];
    readonly log: PublishHandlerDeps['log'];
    readonly outcome: Awaited<ReturnType<Packtory['buildAndPublishAll']>>;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly fileManager: PublishHandlerDeps['fileManager'];
}): Promise<number> {
    args.spinnerRenderer.stopAll();
    return await reportOutcome(args.log, args.fileManager, args.outcome, args.flags);
}

async function runPublishHandler(deps: PublishHandlerDeps): Promise<number> {
    const { log, packtory, spinnerRenderer, configLoader, fileManager, flags } = deps;
    let shouldStopSpinners = true;
    try {
        const outcome = await packtory.buildAndPublishAll(await configLoader.load(), {
            dryRun: !flags.noDryRun,
            collectReport: flags.reportJson || flags.reportHtml
        });
        shouldStopSpinners = false;
        return await stopSpinnersAndReportOutcome({ spinnerRenderer, log, fileManager, outcome, flags });
    } finally {
        if (shouldStopSpinners) {
            spinnerRenderer.stopAll();
        }
        printDryRunNote(log, { noDryRun: flags.noDryRun });
    }
}

function createEmptyReport(): BuildReport {
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        packages: {},
        aggregate: { crossBundleLinks: [] }
    };
}

function isPreviewableResult(result: Awaited<ReturnType<Packtory['buildAndPublishAll']>>['result']): boolean {
    return result.isOk || (result.error.type === 'partial' && result.error.succeeded.length > 0);
}

type PreviewHandlerDeps = {
    readonly log: (message: string) => void;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly openFile: (filePath: string) => Promise<boolean>;
    readonly createTemporaryFilePath: () => string;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly flags: PreviewFlags;
};

// eslint-disable-next-line max-statements -- preview handling intentionally coordinates build, render, paging, and opening in one place
async function runPreviewHandler(deps: PreviewHandlerDeps): Promise<number> {
    const {
        log,
        pageOutput,
        openFile,
        createTemporaryFilePath,
        packtory,
        spinnerRenderer,
        configLoader,
        fileManager,
        flags
    } = deps;
    try {
        const config = await configLoader.load();
        const outcome = await packtory.buildAndPublishAll(config, {
            dryRun: true,
            collectReport: true
        });
        spinnerRenderer.stopAll();
        const report = outcome.getReport() ?? createEmptyReport();
        const document = await buildPreviewDocument({
            report,
            result: outcome.result,
            dryRun: true,
            fileManager
        });
        if (flags.open) {
            const filePath = createTemporaryFilePath();
            await fileManager.writeFile(filePath, renderHtmlReport(document));
            const opened = await openFile(filePath);
            if (!opened) {
                log(filePath);
            }
        } else if (isPreviewableResult(outcome.result)) {
            await pageOutput(renderTerminalPreview(document));
        } else {
            log(renderFailureOnlyTerminalPreview(document).trimEnd());
        }
        return outcome.result.isErr ? 1 : 0;
    } finally {
        spinnerRenderer.stopAll();
    }
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
                    const handlerExitCode = await runPublishHandler({
                        log,
                        packtory,
                        spinnerRenderer,
                        configLoader,
                        fileManager,
                        flags: { noDryRun, reportJson, reportHtml }
                    });
                    exitCode = handlerExitCode;
                }
            }),
            [previewCommandName]: command({
                name: previewCommandName,
                description: 'Builds all packages in fresh dry-run mode and opens a human preview.',
                args: {
                    open: flag({ long: 'open' })
                },
                async handler({ open }) {
                    const handlerExitCode = await runPreviewHandler({
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
                    exitCode = handlerExitCode;
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
