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
    let normalized = url.startsWith('git+') ? url.slice('git+'.length) : url;
    if (normalized.endsWith('.git')) {
        normalized = normalized.slice(0, -'.git'.length);
    }
    if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
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
