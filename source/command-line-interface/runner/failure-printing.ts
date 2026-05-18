import { bold, dim, green, red } from 'yoctocolors';
import type { PublishFailure } from '../../packtory/packtory-results.ts';
import type { BuildAndPublishResult } from '../../packtory/package-processor.ts';
import type { PartialError } from '../../packtory/scheduler.ts';
import { getErrorSymbol, getSuccessSymbol, getWarningSymbol } from './runner-symbols.ts';

type PublishPartialError = PartialError<BuildAndPublishResult>;
type Logger = (message: string) => void;

export function printDryRunNote(log: Logger, flags: { readonly noDryRun: boolean }): void {
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

function printInvalidConfigErrors(log: Logger, issues: readonly string[]): void {
    const title = `${getErrorSymbol()} The provided config is invalid, there are ${issues.length} issue(s)`;
    log(`${title}\n\n- ${issues.join('\n- ')}`);
}

function printCheckErrors(log: Logger, issues: readonly string[]): void {
    const title = `${getErrorSymbol()} Checks failed, there are ${issues.length} issue(s)`;
    log(`${title}\n\n- ${issues.join('\n- ')}`);
}

function printPartialErrorSummary(log: Logger, error: PublishPartialError): void {
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

export function printPublishFailure(log: Logger, error: PublishFailure): void {
    if (error.type === 'config') {
        printInvalidConfigErrors(log, error.issues);
    } else if (error.type === 'checks') {
        printCheckErrors(log, error.issues);
    } else {
        printPartialErrorSummary(log, error);
    }
}

export function printSuccessSummary(log: Logger, results: readonly BuildAndPublishResult[]): void {
    log(`${getSuccessSymbol()} Success: all ${results.length} package(s) have been published`);
}
