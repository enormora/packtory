import type { NpmOpenIdentityConnectPublishAuthentication } from './configuration/registry-settings.ts';

export type NpmOpenIdentityConnectIdentifierTokenResolver = (
    authentication: NpmOpenIdentityConnectPublishAuthentication
) => Promise<string>;

export type NpmOpenIdentityConnectIdentifierTokenResolverDependencies = {
    readonly fetch: typeof globalThis.fetch;
    readonly getEnvironmentVariable: (variableName: string) => string | undefined;
};
type GitHubActionsRequestConfiguration = {
    readonly requestToken: string;
    readonly requestAddress: URL;
};
type EnvironmentVariableReader = (variableName: string) => string | undefined;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return value instanceof Object && !Array.isArray(value);
}

function githubActionsAudience(): string {
    return 'npm:registry.npmjs.org';
}

function defaultIdentityTokenEnvironmentVariableName(): string {
    return 'NPM_ID_TOKEN';
}

function trustedOpenIdentityConnectRequestSuffix(): string {
    return '.actions.githubusercontent.com';
}

function parseOpenIdentityConnectRequestAddress(value: string): URL {
    try {
        return new URL(value);
    } catch {
        throw new Error(`ACTIONS_ID_TOKEN_REQUEST_URL is not a valid URL: "${value}"`);
    }
}

function buildOpenIdentityConnectHostnameMismatchMessage(actualHostname: string): string {
    return (
        `ACTIONS_ID_TOKEN_REQUEST_URL hostname must end with "${trustedOpenIdentityConnectRequestSuffix()}", ` +
        `got "${actualHostname}". A non-GitHub host would receive the GitHub-issued OIDC bearer.`
    );
}

function assertTrustedOpenIdentityConnectRequestAddress(value: string): URL {
    const parsed = parseOpenIdentityConnectRequestAddress(value);
    if (parsed.protocol !== 'https:') {
        throw new Error(`ACTIONS_ID_TOKEN_REQUEST_URL must use https, got: "${value}"`);
    }
    if (!parsed.hostname.endsWith(trustedOpenIdentityConnectRequestSuffix())) {
        throw new Error(buildOpenIdentityConnectHostnameMismatchMessage(parsed.hostname));
    }
    return parsed;
}

function getGitHubActionsRequestConfiguration(
    getEnvironmentVariable: EnvironmentVariableReader
): GitHubActionsRequestConfiguration {
    const requestAddress = getEnvironmentVariable('ACTIONS_ID_TOKEN_REQUEST_URL');
    const requestToken = getEnvironmentVariable('ACTIONS_ID_TOKEN_REQUEST_TOKEN');

    if (requestAddress === undefined || requestToken === undefined) {
        throw new Error('GitHub Actions OIDC requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN');
    }

    return { requestAddress: assertTrustedOpenIdentityConnectRequestAddress(requestAddress), requestToken };
}

function parseGitHubActionsIdentifierTokenResponse(body: unknown): string {
    if (!isRecord(body)) {
        throw new Error('GitHub Actions OIDC token response did not contain a usable id_token');
    }

    const { value } = body;
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error('GitHub Actions OIDC token response did not contain a usable id_token');
    }

    return value;
}

function usesGitHubActionsProvider(
    authentication: NpmOpenIdentityConnectPublishAuthentication,
    getEnvironmentVariable: EnvironmentVariableReader
): boolean {
    const provider = authentication.provider ?? 'automatic';
    const runsInGitHubActions = getEnvironmentVariable('GITHUB_ACTIONS') === 'true';
    return provider === 'github-actions' || provider === 'automatic' && runsInGitHubActions;
}

export function createNpmOpenIdentityConnectIdentifierTokenResolver(
    dependencies: Readonly<NpmOpenIdentityConnectIdentifierTokenResolverDependencies>
): NpmOpenIdentityConnectIdentifierTokenResolver {
    const { fetch: fetchImplementation, getEnvironmentVariable } = dependencies;

    async function fetchGitHubActionsIdentifierToken(): Promise<string> {
        const { requestAddress, requestToken } = getGitHubActionsRequestConfiguration(getEnvironmentVariable);
        requestAddress.searchParams.set('audience', githubActionsAudience());
        const response = await fetchImplementation(requestAddress, {
            headers: { Authorization: `Bearer ${requestToken}` }
        });

        if (!response.ok) {
            throw new Error(`GitHub Actions OIDC token request failed with status ${response.status}`);
        }

        return parseGitHubActionsIdentifierTokenResponse(await response.json());
    }

    return async function (authentication) {
        if (usesGitHubActionsProvider(authentication, getEnvironmentVariable)) {
            return fetchGitHubActionsIdentifierToken();
        }

        const variableName = authentication.identityTokenEnvironmentVariable ??
            defaultIdentityTokenEnvironmentVariableName();
        const value = getEnvironmentVariable(variableName);
        if (value === undefined) {
            throw new Error(`OIDC id_token environment variable "${variableName}" is missing`);
        }

        return value;
    };
}
