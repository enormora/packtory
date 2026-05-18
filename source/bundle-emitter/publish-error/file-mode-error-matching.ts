import { isErrorLike, isRecord } from './error-shape-helpers.ts';
import {
    buildInvalidProvenanceFileMessage,
    buildMissingProvenanceFileMessage,
    buildProvenanceDigestMismatchMessage
} from './publish-error-messages.ts';

function isProvenanceBundleError(message: string): boolean {
    return (
        message.includes('Bundle is invalid') ||
        message.includes('Unsupported bundle format') ||
        message.includes('Invalid bundle') ||
        message.includes('subject does not match')
    );
}

function isProvenanceDigestMismatch(message: string): boolean {
    return message.includes('subject') || message.includes('digest');
}

export function matchFileModeError(error: unknown, filePath: string): Error | undefined {
    if (isRecord(error) && error.code === 'ENOENT') {
        return new Error(buildMissingProvenanceFileMessage(filePath), { cause: error });
    }
    if (!isErrorLike(error)) {
        return undefined;
    }

    const { message } = error;
    if (!isProvenanceBundleError(message)) {
        return undefined;
    }
    if (isProvenanceDigestMismatch(message)) {
        return new Error(buildProvenanceDigestMismatchMessage(filePath), { cause: error });
    }
    return new Error(buildInvalidProvenanceFileMessage(filePath), { cause: error });
}
