import type { Result } from 'true-myth';
import type { BuildAndPublishResult } from '../../packtory/package-processor.ts';
import type { PublishAllResult } from '../../packtory/packtory.ts';
import type { PartialError } from '../../packtory/scheduler.ts';

export type PreviewResultType = 'checks' | 'config' | 'partial' | 'success';

type FailureLike<T> =
    | { readonly type: 'checks'; readonly issues: readonly string[] }
    | { readonly type: 'config'; readonly issues: readonly string[] }
    | (PartialError<T> & { readonly type: 'partial' });

type ResultLike<T> = Result<readonly T[], FailureLike<T>>;

export function isPreviewableResult<T>(result: ResultLike<T>): boolean {
    return result.isOk || (result.error.type === 'partial' && result.error.succeeded.length > 0);
}

export function getSucceededResults(result: PublishAllResult): readonly BuildAndPublishResult[] {
    if (result.isOk) {
        return result.value;
    }
    if (result.error.type === 'partial') {
        return result.error.succeeded;
    }
    return [];
}

export function getIssues<T>(result: ResultLike<T>): readonly string[] {
    if (result.isOk) {
        return [];
    }
    if (result.error.type === 'partial') {
        return result.error.failures.map((failure) => {
            return failure.message;
        });
    }
    return result.error.issues;
}

export function getResultType<T>(result: ResultLike<T>): PreviewResultType {
    if (result.isOk) {
        return 'success';
    }
    return result.error.type;
}
