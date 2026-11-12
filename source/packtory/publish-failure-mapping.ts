import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { SkippedPackage } from './scheduler.ts';
import type { PublishFailure, ResolveAndLinkFailure } from './packtory-results.ts';

export function mapResolveFailureToPublishFailure(
    error: ResolveAndLinkFailure,
    progressBroadcastProvider: ProgressBroadcastProvider
): PublishFailure {
    if (error.type === 'partial') {
        const skipped = error.error.succeeded.map(function (entry): SkippedPackage {
            const skippedPackage = {
                packageName: entry.name,
                reason: 'Publishing stopped because package resolution failed'
            };
            progressBroadcastProvider.emit('skipped', skippedPackage);
            return skippedPackage;
        });
        return {
            type: 'partial',
            succeeded: [],
            skipped: [ ...skipped, ...error.error.skipped ],
            failures: error.error.failures
        };
    }
    return error;
}
