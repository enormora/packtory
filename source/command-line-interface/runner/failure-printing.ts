import { match } from 'ts-pattern';
import { bold, dim, green, red } from 'yoctocolors';
import type { PublicationOutcome } from '../../bundle-emitter/publication-outcome.ts';
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
type StagedResult = BuildAndPublishResult & {
    readonly publication: Extract<PublicationOutcome, { readonly type: 'staged'; }>;
};
type Logger = (message: string) => void;
type DryRunFlags = {
    readonly noDryRun: boolean;
};
type PublishSuccessFlags = {
    readonly stage: boolean;
};
const issueTitleByType = {
    [configErrorType]: 'The provided config is invalid',
    [checksErrorType]: 'Checks failed'
} as const;

export function printDryRunNote(log: Logger, flags: DryRunFlags): void {
    if (flags.noDryRun) {
        return;
    }
    log(
        `${getWarningSymbol()} ${
            dim(
                ` Note: dry-run mode was enabled, so there was nothing really published; add the ${
                    bold(
                        '--no-dry-run'
                    )
                } flag to disable dry-run mode`
            )
        }`
    );
}

function formatStageReceipt(result: StagedResult): string {
    return `- ${result.bundle.name}@${result.bundle.version}: ${result.publication.stageId}`;
}

function isStagedResult(result: BuildAndPublishResult): result is StagedResult {
    return result.publication.type === 'staged';
}

function selectStagedResults(results: readonly BuildAndPublishResult[]): readonly StagedResult[] {
    return results.filter(isStagedResult);
}

function printStagedPackageList(log: Logger, results: readonly BuildAndPublishResult[]): void {
    const stagedResults = selectStagedResults(results);
    if (stagedResults.length === 0) {
        return;
    }
    log([ 'Staged packages:', ...stagedResults.map(formatStageReceipt) ].join('\n'));
}

function printIssueSummary(log: Logger, title: string, issues: readonly string[]): void {
    const header = `${getErrorSymbol()} ${title}, there are ${issues.length} issue(s)`;
    log(`${header}\n\n- ${issues.join('\n- ')}`);
}

function formatStageSuccessSummary(results: readonly BuildAndPublishResult[]): string {
    const stagedResults = selectStagedResults(results);
    if (stagedResults.length === 0) {
        return (
            `${getSuccessSymbol()} Success: no packages were staged; ` +
            `all ${results.length} package(s) were already up-to-date`
        );
    }

    const unchangedCount = results.length - stagedResults.length;
    const unchangedSuffix = unchangedCount === 0 ? '' : `; ${dim(String(unchangedCount))} already up-to-date`;
    return `${getSuccessSymbol()} Success: staged ${stagedResults.length} package(s)${unchangedSuffix}`;
}

function printPartialErrorSummary(log: Logger, error: PublishPartialError, stage: boolean): void {
    const total = error.succeeded.length + error.failures.length;
    const failureCount = red(String(error.failures.length));
    const successCount = green(String(error.succeeded.length));
    const summary = `${getErrorSymbol()} ${failureCount} from ${bold(String(total))} package(s) failed; ` +
        `${successCount} succeeded`;
    const details = partialFailureMessages(error).map(function (message) {
        return `- ${message}`;
    });
    log([ summary, ...details ].join('\n'));
    if (stage) {
        printStagedPackageList(log, error.succeeded);
    }
}

export function printPublishFailure(log: Logger, error: PublishFailure, stage: boolean): void {
    match(error)
        .with({ type: partialFailureType }, function (partialError) {
            printPartialErrorSummary(log, partialError, stage);
        })
        .otherwise(function (issueError) {
            printIssueSummary(log, issueTitleByType[issueError.type], issueError.issues);
        });
}

export function printSuccessSummary(
    log: Logger,
    results: readonly BuildAndPublishResult[],
    flags: PublishSuccessFlags
): void {
    if (!flags.stage) {
        log(`${getSuccessSymbol()} Success: all ${results.length} package(s) have been published`);
        return;
    }

    log(formatStageSuccessSummary(results));
    printStagedPackageList(log, results);
}
