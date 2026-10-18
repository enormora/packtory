function hostnameFromAddress(value: string): string {
    const address = new URL(value);
    return address.hostname;
}

function expectedApplicationProgrammingInterfaceHostname(): string {
    return hostnameFromAddress('https://api.github.com');
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
        hostname === hostnameFromAddress('http://127.0.0.1') ||
        hostname === hostnameFromAddress('http://[::1]') ||
        hostname === hostnameFromAddress('http://localhost')
    );
}

function buildMismatchMessage(actualHostname: string): string {
    return (
        `GITHUB_API_BASE_URL hostname must be "${expectedApplicationProgrammingInterfaceHostname()}", ` +
        `got "${actualHostname}". ` +
        'A non-GitHub host would receive the GITHUB_TOKEN.'
    );
}

export function assertGitHubApplicationProgrammingInterfaceBaseAddress(value: string): string {
    const parsed = parseOrThrow(value);

    if (isLoopbackHostname(parsed.hostname)) {
        return value;
    }
    if (parsed.protocol !== 'https:') {
        throw new Error(`GITHUB_API_BASE_URL must use https, got: "${value}"`);
    }
    if (parsed.hostname !== expectedApplicationProgrammingInterfaceHostname()) {
        throw new Error(buildMismatchMessage(parsed.hostname));
    }

    return value;
}
