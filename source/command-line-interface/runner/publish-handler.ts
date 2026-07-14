import type { FileManager } from '../../file-manager/file-manager.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { printDryRunNote, printPublishFailure, printSuccessSummary } from './failure-printing.ts';
import { writeReports, type ReportFlags } from './report-persistence.ts';

type Logger = (message: string) => void;
type BuildOutcome = Awaited<ReturnType<Packtory['buildAndPublishAll']>>;

export type PublishHandlerDependencies = {
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly flags: ReportFlags & { readonly noDryRun: boolean; readonly stage: boolean; };
};

async function reportOutcome(
    log: Logger,
    fileManager: PublishHandlerDependencies['fileManager'],
    outcome: BuildOutcome,
    flags: PublishHandlerDependencies['flags']
): Promise<number> {
    let exitCode = 0;
    if (outcome.result.isErr) {
        exitCode = 1;
        printPublishFailure(log, outcome.result.error, flags.stage);
    } else {
        printSuccessSummary(log, outcome.result.value, { stage: flags.stage });
    }
    await writeReports({
        dryRun: !flags.noDryRun,
        fileManager,
        flags,
        report: outcome.getReport(),
        result: outcome.result
    });
    return exitCode;
}

async function publish(dependencies: PublishHandlerDependencies): Promise<number> {
    const { log, packtory, spinnerRenderer, configLoader, fileManager, flags } = dependencies;
    const outcome = await packtory.buildAndPublishAll(await configLoader.load(), {
        dryRun: !flags.noDryRun,
        stage: flags.stage,
        collectReport: flags.reportJson || flags.reportHtml
    });
    spinnerRenderer.stopAll();
    return reportOutcome(log, fileManager, outcome, flags);
}

export async function runPublishHandler(dependencies: PublishHandlerDependencies): Promise<number> {
    const { log, spinnerRenderer, flags } = dependencies;
    let shouldStopSpinners = true;
    try {
        const exitCode = await publish(dependencies);
        shouldStopSpinners = false;
        return exitCode;
    } finally {
        if (shouldStopSpinners) {
            spinnerRenderer.stopAll();
        }
        printDryRunNote(log, { noDryRun: flags.noDryRun });
    }
}
