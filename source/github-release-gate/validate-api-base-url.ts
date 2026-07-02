function hostnameFromUrl(value: string): string {
    const url = new URL(value);
    return url.hostname;
}

function expectedApiHostname(): string {
    return hostnameFromUrl('https://api.github.com');
}

function parseOrThrow(value: string): URL {
    try {
        return new URL(value);
    } catch {
        throw new Error(`GITHUB_API_BASE_URL is not a valid URL: "${value}"`);
    }
}

function isLoopbackHostname(hostname: string): boolean {
    return (
        hostname === hostnameFromUrl('http://127.0.0.1') ||
        hostname === hostnameFromUrl('http://[::1]') ||
        hostname === hostnameFromUrl('http://localhost')
    );
}

function buildMismatchMessage(actualHostname: string): string {
    return (
        `GITHUB_API_BASE_URL hostname must be "${expectedApiHostname()}", got "${actualHostname}". ` +
        'A non-GitHub host would receive the GITHUB_TOKEN.'
    );
}

export function assertGitHubApiBaseUrl(value: string): string {
    const parsed = parseOrThrow(value);

    if (isLoopbackHostname(parsed.hostname)) {
        return value;
    }
    if (parsed.protocol !== 'https:') {
        throw new Error(`GITHUB_API_BASE_URL must use https, got: "${value}"`);
    }
    if (parsed.hostname !== expectedApiHostname()) {
        throw new Error(buildMismatchMessage(parsed.hostname));
    }

    return value;
}
