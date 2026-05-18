export const unsupportedProviderMarker = 'not supported for provider:';

export const githubActionsIdTokenMessage = [
    'GitHub Actions provenance needs "permissions: id-token: write" on the workflow job.',
    'See the packtory readme for the workflow snippet.'
].join(' ');

export const gitlabSigstoreIdTokenMessage = [
    'GitLab CI provenance needs an "id_tokens" entry with audience "sigstore"',
    'exposed as SIGSTORE_ID_TOKEN. See the packtory readme for the workflow snippet.'
].join(' ');

export function buildUnsupportedProviderMessage(ciName: string): string {
    return [
        'Provenance auto mode requires GitHub Actions or GitLab CI.',
        `Detected CI: ${ciName}.`,
        "Use provenance: { type: 'file' } for other environments."
    ].join(' ');
}

export function buildMissingProvenanceFileMessage(filePath: string): string {
    return [
        `Provenance bundle file "${filePath}" does not exist.`,
        "Generate it with your CI's attestation tool (e.g. actions/attest-build-provenance)",
        'before running packtory.'
    ].join(' ');
}

export function buildInvalidProvenanceFileMessage(filePath: string): string {
    return [
        `Provenance bundle file "${filePath}" is not a valid sigstore bundle.`,
        'Re-generate it from the current build.'
    ].join(' ');
}

export function buildProvenanceDigestMismatchMessage(filePath: string): string {
    return [
        `Provenance bundle at "${filePath}" was signed against a different tarball`,
        'than the one packtory built. Re-generate the bundle from the current source —',
        'shipping a mismatched attestation would defeat the purpose of provenance.'
    ].join(' ');
}
