import HostedGitInformation from 'hosted-git-info';
import { isPlainObject } from 'remeda';

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function extractRawAddress(input: unknown): string | undefined {
    if (isNonEmptyString(input)) {
        return input;
    }
    if (isPlainObject(input) && isNonEmptyString(input.url)) {
        return input.url;
    }
    return undefined;
}

function manualNormalize(address: string): string {
    return address
        .replace(/^git\+/u, '')
        .replace(/\.git$/u, '')
        .replace(/\/$/u, '')
        .toLowerCase();
}

export function normalizeRepositoryAddress(input: unknown): string | undefined {
    const rawAddress = extractRawAddress(input);
    if (rawAddress === undefined) {
        return undefined;
    }

    const hosted = HostedGitInformation.fromUrl(rawAddress);
    if (hosted !== undefined) {
        return manualNormalize(hosted.https({ noCommittish: true }));
    }

    return manualNormalize(rawAddress);
}
