import type { ReleaseDiffFailure, ResolveAndLinkFailure } from './packtory-results.ts';

export function mapResolveFailureToReleaseDiffFailure(error: ResolveAndLinkFailure): ReleaseDiffFailure {
    if (error.type === 'partial') {
        return { type: 'partial', succeeded: [], failures: error.error.failures };
    }
    return error;
}
