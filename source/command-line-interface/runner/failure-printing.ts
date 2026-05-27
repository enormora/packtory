import { match } from 'ts-pattern';
import { bold, dim, green, red } from 'yoctocolors';
import {
    checksErrorType,
    configErrorType,
    partialFailureType,
    type PublishFailure
} from '../../packtory/packtory-results.ts';
import type { BuildAndPublishResult } from '../../packtory/package-processor.ts';
import { partialFailureMessages } from '../../packtory/partial-result.ts';
import type { PartialError } from '../../packtory/scheduler.ts';
import { getErrorSymbol, getSuccessSymbol, getWarningSymbol } from './runner-symbols.ts';

type PublishPartialError = PartialError<BuildAndPublishResult>;
type Logger = (message: string) => void;
const issueTitleByType = {
    [configErrorType]: 'The provided config is invalid',
    [checksErrorType]: 'Checks failed'
} as const;

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

function printIssueSummary(log: Logger, title: string, issues: readonly string[]): void {
    const header = `${getErrorSymbol()} ${title}, there are ${issues.length} issue(s)`;
    log(`${header}\n\n- ${issues.join('\n- ')}`);
}

function printPartialErrorSummary(log: Logger, error: PublishPartialError): void {
    const total = error.succeeded.length + error.failures.length;
    const failureCount = red(String(error.failures.length));
    const successCount = green(String(error.succeeded.length));
    const summary =
        `${getErrorSymbol()} ${failureCount} from ${bold(String(total))} package(s) failed; ` +
        `${successCount} succeeded`;
    const details = partialFailureMessages(error).map((message) => {
        return `- ${message}`;
    });
    log([summary, ...details].join('\n'));
}

export function printPublishFailure(log: Logger, error: PublishFailure): void {
    match(error)
        .with({ type: partialFailureType }, (partialError) => {
            printPartialErrorSummary(log, partialError);
        })
        .otherwise((issueError) => {
            printIssueSummary(log, issueTitleByType[issueError.type], issueError.issues);
        });
}

export function printSuccessSummary(log: Logger, results: readonly BuildAndPublishResult[]): void {
    log(`${getSuccessSymbol()} Success: all ${results.length} package(s) have been published`);
}
