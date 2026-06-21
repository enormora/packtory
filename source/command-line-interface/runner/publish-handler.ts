import type { FileManager } from '../../file-manager/file-manager.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { printDryRunNote, printPublishFailure, printSuccessSummary } from './failure-printing.ts';
import { writeReports, type ReportFlags } from './report-persistence.ts';

type Logger = (message: string) => void;
type BuildOutcome = Awaited<ReturnType<Packtory['buildAndPublishAll']>>;

export type PublishHandlerDeps = {
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly flags: ReportFlags & { readonly noDryRun: boolean; readonly stage: boolean };
};

async function reportOutcome(
    log: Logger,
    fileManager: PublishHandlerDeps['fileManager'],
    outcome: BuildOutcome,
    flags: PublishHandlerDeps['flags']
): Promise<number> {
    let exitCode = 0;
    if (outcome.result.isErr) {
        exitCode = 1;
        printPublishFailure(log, outcome.result.error, flags.stage);
    } else {
        printSuccessSummary(log, outcome.result.value, { stage: flags.stage });
    }
    await writeReports(fileManager, outcome.getReport(), outcome.result, flags, !flags.noDryRun);
    return exitCode;
}

export async function runPublishHandler(deps: PublishHandlerDeps): Promise<number> {
    const { log, packtory, spinnerRenderer, configLoader, fileManager, flags } = deps;
    let shouldStopSpinners = true;
    try {
        const outcome = await packtory.buildAndPublishAll(await configLoader.load(), {
            dryRun: !flags.noDryRun,
            stage: flags.stage,
            collectReport: flags.reportJson || flags.reportHtml
        });
        shouldStopSpinners = false;
        spinnerRenderer.stopAll();
        return await reportOutcome(log, fileManager, outcome, flags);
    } finally {
        if (shouldStopSpinners) {
            spinnerRenderer.stopAll();
        }
        printDryRunNote(log, { noDryRun: flags.noDryRun });
    }
}
