import type { PublishFailure, ResolveAndLinkFailure } from './packtory-results.ts';

export function mapResolveFailureToPublishFailure(error: ResolveAndLinkFailure): PublishFailure {
    if (error.type === 'partial') {
        return { type: 'partial', succeeded: [], failures: error.error.failures };
    }
    return error;
}
