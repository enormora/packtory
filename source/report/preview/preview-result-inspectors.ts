import type { Result } from 'true-myth';
import type { BuildAndPublishResult } from '../../packtory/package-processor.ts';
import { isSuccessOrPartialSuccess, partialFailureMessages } from '../../packtory/partial-result.ts';
import type { PublishAllResult } from '../../packtory/packtory.ts';
import { partialFailureType, previewResultType } from '../../packtory/packtory-results.ts';
import type { PartialError } from '../../packtory/scheduler.ts';

export type PreviewResultType = (typeof previewResultType)[keyof typeof previewResultType];

type FailureLike<T> =
    | { readonly type: typeof previewResultType.checks; readonly issues: readonly string[] }
    | { readonly type: typeof previewResultType.config; readonly issues: readonly string[] }
    | (PartialError<T> & { readonly type: typeof partialFailureType });

type ResultLike<T> = Result<readonly T[], FailureLike<T>>;
type PreviewResultDescription<T> = {
    readonly issues: readonly string[];
    readonly succeeded: readonly T[];
    readonly type: PreviewResultType;
};

export const isPreviewableResult: <T>(result: ResultLike<T>) => boolean = isSuccessOrPartialSuccess;

function describePreviewResult<T>(result: ResultLike<T>): PreviewResultDescription<T> {
    if (result.isOk) {
        return {
            type: previewResultType.success,
            succeeded: result.value,
            issues: []
        };
    }

    if (result.error.type === partialFailureType) {
        return {
            type: previewResultType.partial,
            succeeded: result.error.succeeded,
            issues: partialFailureMessages(result.error)
        };
    }

    return {
        type: result.error.type,
        succeeded: [],
        issues: result.error.issues
    };
}

export function getSucceededResults(result: PublishAllResult): readonly BuildAndPublishResult[] {
    return describePreviewResult(result).succeeded;
}

export function getIssues<T>(result: ResultLike<T>): readonly string[] {
    return describePreviewResult(result).issues;
}

export function getResultType<T>(result: ResultLike<T>): PreviewResultType {
    return describePreviewResult(result).type;
}
