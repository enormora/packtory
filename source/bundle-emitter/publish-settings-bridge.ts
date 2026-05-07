import type { PublishSettings } from '../config/publish-settings.ts';

type PublishProvenanceOptions = { readonly provenance: true } | { readonly provenanceFile: string };

export type PublishOptionsForLibnpmpublish = Partial<PublishProvenanceOptions> & {
    readonly access: 'public' | 'restricted';
};

export function buildPublishOptionsForPublishSettings(
    publishSettings: Readonly<PublishSettings>
): PublishOptionsForLibnpmpublish {
    if (publishSettings.access === 'restricted') {
        return { access: 'restricted' };
    }
    if (publishSettings.provenance === undefined) {
        return { access: 'public' };
    }
    if (publishSettings.provenance.type === 'auto') {
        return { access: 'public', provenance: true };
    }
    return { access: 'public', provenanceFile: publishSettings.provenance.path };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value instanceof Object;
}

type ErrorLike = { readonly message: string; readonly code?: unknown };

function isErrorLike(error: unknown): error is ErrorLike {
    return isRecord(error) && typeof error.message === 'string';
}

const unsupportedProviderMarker = 'not supported for provider:';

function getCiName(message: string): string {
    const tail = message.slice(message.indexOf(unsupportedProviderMarker) + unsupportedProviderMarker.length).trim();
    if (tail === '') {
        return 'unknown';
    }
    const whitespaceIndex = tail.search(/\s/u);
    if (whitespaceIndex === -1) {
        return tail;
    }
    return tail.slice(0, whitespaceIndex);
}

function buildUnsupportedProviderMessage(ciName: string): string {
    return [
        'Provenance auto mode requires GitHub Actions or GitLab CI.',
        `Detected CI: ${ciName}.`,
        "Use provenance: { type: 'file' } for other environments."
    ].join(' ');
}

const githubActionsIdTokenMessage = [
    'GitHub Actions provenance needs "permissions: id-token: write" on the workflow job.',
    'See the packtory readme for the workflow snippet.'
].join(' ');

const gitlabSigstoreIdTokenMessage = [
    'GitLab CI provenance needs an "id_tokens" entry with audience "sigstore"',
    'exposed as SIGSTORE_ID_TOKEN. See the packtory readme for the workflow snippet.'
].join(' ');

function buildMissingProvenanceFileMessage(filePath: string): string {
    return [
        `Provenance bundle file "${filePath}" does not exist.`,
        "Generate it with your CI's attestation tool (e.g. actions/attest-build-provenance)",
        'before running packtory.'
    ].join(' ');
}

function buildInvalidProvenanceFileMessage(filePath: string): string {
    return [
        `Provenance bundle file "${filePath}" is not a valid sigstore bundle.`,
        'Re-generate it from the current build.'
    ].join(' ');
}

function buildProvenanceDigestMismatchMessage(filePath: string): string {
    return [
        `Provenance bundle at "${filePath}" was signed against a different tarball`,
        'than the one packtory built. Re-generate the bundle from the current source —',
        'shipping a mismatched attestation would defeat the purpose of provenance.'
    ].join(' ');
}

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

function matchAutoModeError(error: unknown): Error | undefined {
    if (!isErrorLike(error)) {
        return undefined;
    }

    const { message } = error;
    if (message.includes(unsupportedProviderMarker)) {
        return new Error(buildUnsupportedProviderMessage(getCiName(message)), { cause: error });
    }
    if (message.includes('"write" access to the "id-token" permission')) {
        return new Error(githubActionsIdTokenMessage, { cause: error });
    }
    if (message.includes('SIGSTORE_ID_TOKEN')) {
        return new Error(gitlabSigstoreIdTokenMessage, { cause: error });
    }
    return undefined;
}

function matchFileModeError(error: unknown, filePath: string): Error | undefined {
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

function getProvenanceFilePath(publishSettings: Readonly<PublishSettings>): string | undefined {
    if (publishSettings.access !== 'public') {
        return undefined;
    }
    if (publishSettings.provenance?.type !== 'file') {
        return undefined;
    }
    return publishSettings.provenance.path;
}

function ensureError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

export function remapPublishError(error: unknown, publishSettings: Readonly<PublishSettings>): Error {
    const autoModeError = matchAutoModeError(error);
    if (autoModeError !== undefined) {
        return autoModeError;
    }

    const filePath = getProvenanceFilePath(publishSettings);
    if (filePath !== undefined) {
        const fileModeError = matchFileModeError(error, filePath);
        if (fileModeError !== undefined) {
            return fileModeError;
        }
    }

    return ensureError(error);
}
