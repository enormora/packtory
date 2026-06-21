import { partialFailureMessages } from '../../packtory/partial-result.ts';
import type { ReleasePlanPackage, ReleasePlanResult } from '../../packtory/packtory.ts';
import { checksErrorType, configErrorType, type ReleasePlanFailure } from '../../packtory/packtory-results.ts';

type Logger = (message: string) => void;

function printIssueFailure(log: Logger, title: string, issues: readonly string[]): void {
    log(`${title}, there are ${issues.length} issue(s)\n\n- ${issues.join('\n- ')}`);
}

export function printReleasePlanFailure(log: Logger, error: ReleasePlanFailure): void {
    if (error.type === configErrorType) {
        printIssueFailure(log, 'Configuration issues', error.issues);
        return;
    }
    if (error.type === checksErrorType) {
        printIssueFailure(log, 'Check issues', error.issues);
        return;
    }
    log(partialFailureMessages(error).join('\n'));
}

export function collectReleasePlanPackages(result: ReleasePlanResult): readonly ReleasePlanPackage[] {
    if (result.isOk) {
        return result.value.packages;
    }
    if ('succeeded' in result.error) {
        return result.error.succeeded;
    }
    return [];
}
