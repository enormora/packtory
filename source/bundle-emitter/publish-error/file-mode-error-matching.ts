import { isErrorLike, isRecord } from './error-shape-helpers.ts';
import {
    buildInvalidProvenanceFileMessage,
    buildMissingProvenanceFileMessage,
    buildProvenanceDigestMismatchMessage
} from './publish-error-messages.ts';

const provenanceBundleMarkers = [
    'Bundle is invalid',
    'Unsupported bundle format',
    'Invalid bundle',
    'subject does not match'
] as const;
const provenanceDigestMismatchMarkers = ['subject', 'digest'] as const;

function includesOneOf(message: string, markers: readonly string[]): boolean {
    for (const marker of markers) {
        if (message.includes(marker)) {
            return true;
        }
    }

    return false;
}

export function matchFileModeError(error: unknown, filePath: string): Error | undefined {
    if (isRecord(error) && error.code === 'ENOENT') {
        return new Error(buildMissingProvenanceFileMessage(filePath), { cause: error });
    }
    if (!isErrorLike(error)) {
        return undefined;
    }

    const { message } = error;
    if (!includesOneOf(message, provenanceBundleMarkers)) {
        return undefined;
    }
    if (includesOneOf(message, provenanceDigestMismatchMarkers)) {
        return new Error(buildProvenanceDigestMismatchMessage(filePath), { cause: error });
    }
    return new Error(buildInvalidProvenanceFileMessage(filePath), { cause: error });
}
