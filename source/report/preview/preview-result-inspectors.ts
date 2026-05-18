import type { BuildAndPublishResult } from '../../packtory/package-processor.ts';
import type { PublishAllResult } from '../../packtory/packtory.ts';

export type PreviewResultType = 'checks' | 'config' | 'partial' | 'success';

export function isPreviewableResult(result: PublishAllResult): boolean {
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

export function getIssues(result: PublishAllResult): readonly string[] {
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

export function getResultType(result: PublishAllResult): PreviewResultType {
    if (result.isOk) {
        return 'success';
    }
    return result.error.type;
}
