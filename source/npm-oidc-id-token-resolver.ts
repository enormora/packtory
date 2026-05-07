import { z } from 'zod/mini';
import type { PublishAuthStrategy } from './config/registry-settings.ts';

const githubActionsAudience = 'npm:registry.npmjs.org';
const defaultOidcIdTokenEnvVariableName = 'NPM_ID_TOKEN';

type NpmOidcAuth = Extract<PublishAuthStrategy, { type: 'npm-oidc' }>;

export type NpmOidcIdTokenResolver = (auth: NpmOidcAuth) => Promise<string>;

export type NpmOidcIdTokenResolverDependencies = {
    readonly fetch: typeof globalThis.fetch;
    readonly getEnvironmentVariable: (variableName: string) => string | undefined;
};

const gitHubActionsIdTokenResponseSchema = z.object({
    value: z.string().check(z.minLength(1))
});

async function parseJsonResponse(response: Response): Promise<unknown> {
    return response.json() as Promise<unknown>;
}

function getGitHubActionsRequestConfig(getEnvironmentVariable: (variableName: string) => string | undefined): {
    readonly requestUrl: string;
    readonly requestToken: string;
} {
    const requestUrl = getEnvironmentVariable('ACTIONS_ID_TOKEN_REQUEST_URL');
    const requestToken = getEnvironmentVariable('ACTIONS_ID_TOKEN_REQUEST_TOKEN');

    if (requestUrl === undefined || requestToken === undefined) {
        throw new Error('GitHub Actions OIDC requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN');
    }

    return { requestUrl, requestToken };
}

function parseGitHubActionsIdTokenResponse(body: unknown): string {
    const result = gitHubActionsIdTokenResponseSchema.safeParse(body);
    if (!result.success) {
        throw new Error('GitHub Actions OIDC token response did not contain a usable id_token');
    }

    return result.data.value;
}

function usesGitHubActionsProvider(
    auth: NpmOidcAuth,
    getEnvironmentVariable: (variableName: string) => string | undefined
): boolean {
    const provider = auth.provider ?? 'auto';
    const runsInGitHubActions = getEnvironmentVariable('GITHUB_ACTIONS') === 'true';
    return provider === 'github-actions' || (provider === 'auto' && runsInGitHubActions);
}

export function createNpmOidcIdTokenResolver(
    dependencies: Readonly<NpmOidcIdTokenResolverDependencies>
): NpmOidcIdTokenResolver {
    const { fetch: fetchImplementation, getEnvironmentVariable } = dependencies;

    async function fetchGitHubActionsIdToken(): Promise<string> {
        const { requestUrl, requestToken } = getGitHubActionsRequestConfig(getEnvironmentVariable);
        const url = new URL(requestUrl);
        url.searchParams.set('audience', githubActionsAudience);
        const response = await fetchImplementation(url, {
            headers: { Authorization: `Bearer ${requestToken}` }
        });

        if (!response.ok) {
            throw new Error(`GitHub Actions OIDC token request failed with status ${response.status}`);
        }

        return parseGitHubActionsIdTokenResponse(await parseJsonResponse(response));
    }

    return async (auth) => {
        if (usesGitHubActionsProvider(auth, getEnvironmentVariable)) {
            return fetchGitHubActionsIdToken();
        }

        const variableName = auth.idTokenEnvVar ?? defaultOidcIdTokenEnvVariableName;
        const value = getEnvironmentVariable(variableName);
        if (value === undefined) {
            throw new Error(`OIDC id_token environment variable "${variableName}" is missing`);
        }

        return value;
    };
}
