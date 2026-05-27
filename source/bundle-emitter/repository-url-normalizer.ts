import HostedGitInfo from 'hosted-git-info';
import { isPlainObject } from 'remeda';

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function extractRawUrl(input: unknown): string | undefined {
    if (isNonEmptyString(input)) {
        return input;
    }
    if (isPlainObject(input) && isNonEmptyString(input.url)) {
        return input.url;
    }
    return undefined;
}

function manualNormalize(url: string): string {
    return url
        .replace(/^git\+/u, '')
        .replace(/\.git$/u, '')
        .replace(/\/$/u, '')
        .toLowerCase();
}

export function normalizeRepositoryUrl(input: unknown): string | undefined {
    const rawUrl = extractRawUrl(input);
    if (rawUrl === undefined) {
        return undefined;
    }

    const hosted = HostedGitInfo.fromUrl(rawUrl);
    if (hosted !== undefined) {
        return manualNormalize(hosted.https({ noCommittish: true }));
    }

    return manualNormalize(rawUrl);
}
