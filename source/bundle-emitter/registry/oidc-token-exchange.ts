import type { Clock } from '../../common/clock.ts';
import type { PublishAuthStrategy, RegistrySettings } from '../../config/registry-settings.ts';
import {
    buildAuthOptions,
    createBaseOptions,
    isNpmRegistry,
    npmRegistryUrl,
    resolvePublishAuth,
    resolveRegistryUrl,
    type NpmFetchOptions
} from './registry-auth-config.ts';
import { parseOidcExchangeResponse } from './registry-response-schemas.ts';

const oidcExchangeRefreshThresholdInMilliseconds = 60_000;

type OidcExchangeToken = {
    readonly token: string;
    readonly expiresAt: number;
};

type OidcExchangerDependencies = {
    readonly fetch: typeof globalThis.fetch;
    readonly clock: Clock;
    readonly resolveIdToken: (auth: Extract<PublishAuthStrategy, { type: 'npm-oidc' }>) => Promise<string>;
};

export type OidcTokenExchanger = {
    exchangeToken: (
        packageName: string,
        registrySettings: Readonly<RegistrySettings>,
        auth: Extract<PublishAuthStrategy, { type: 'npm-oidc' }>
    ) => Promise<string>;
    resolveWriteAuthOptions: (
        packageName: string,
        registrySettings: Readonly<RegistrySettings>
    ) => Promise<NpmFetchOptions>;
};

function encodePackageName(name: string): string {
    return name.replace('/', '%2F');
}

async function readJson(response: Response): Promise<unknown> {
    return response.json() as Promise<unknown>;
}

export function createOidcTokenExchanger(dependencies: OidcExchangerDependencies): OidcTokenExchanger {
    const { fetch: fetchImplementation, clock, resolveIdToken } = dependencies;
    const cache = new Map<string, OidcExchangeToken>();

    function getCacheKey(packageName: string, registrySettings: Readonly<RegistrySettings>): string {
        return `${resolveRegistryUrl(registrySettings) ?? npmRegistryUrl}::${packageName}`;
    }

    function readCachedToken(cacheKey: string): string | undefined {
        const cachedToken = cache.get(cacheKey);
        if (cachedToken === undefined) {
            return undefined;
        }

        const currentTime = clock.getCurrentTimeInMilliseconds();
        if (cachedToken.expiresAt - currentTime > oidcExchangeRefreshThresholdInMilliseconds) {
            return cachedToken.token;
        }
        return undefined;
    }

    async function postExchangeRequest(packageName: string, idToken: string): Promise<Response> {
        return fetchImplementation(
            `${npmRegistryUrl}-/npm/v1/oidc/token/exchange/package/${encodePackageName(packageName)}`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` }
            } satisfies RequestInit
        );
    }

    function parseExchangedToken(body: unknown): { readonly token: string; readonly expiresAt: number } {
        const parsed = parseOidcExchangeResponse(body);
        if (!parsed.success) {
            throw new TypeError(`OIDC token exchange returned an invalid response: ${parsed.issues.join('; ')}`);
        }
        const expiresAt = Date.parse(parsed.data.expires);
        if (!Number.isFinite(expiresAt)) {
            throw new TypeError('OIDC token exchange returned an invalid expiry timestamp');
        }
        return { token: parsed.data.token, expiresAt };
    }

    async function requestExchange(
        packageName: string,
        auth: Extract<PublishAuthStrategy, { type: 'npm-oidc' }>
    ): Promise<{ readonly token: string; readonly expiresAt: number }> {
        const idToken = await resolveIdToken(auth);
        const exchangeResponse = await postExchangeRequest(packageName, idToken);
        if (!exchangeResponse.ok) {
            throw new Error(`OIDC token exchange failed with status ${exchangeResponse.status}`);
        }
        return parseExchangedToken(await readJson(exchangeResponse));
    }

    async function exchangeToken(
        packageName: string,
        registrySettings: Readonly<RegistrySettings>,
        auth: Extract<PublishAuthStrategy, { type: 'npm-oidc' }>
    ): Promise<string> {
        const cacheKey = getCacheKey(packageName, registrySettings);
        const cached = readCachedToken(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        if (!isNpmRegistry(resolveRegistryUrl(registrySettings))) {
            throw new Error('npm-oidc auth is only supported with the npmjs.org registry');
        }

        const exchanged = await requestExchange(packageName, auth);
        cache.set(cacheKey, exchanged);
        return exchanged.token;
    }

    return {
        exchangeToken,

        async resolveWriteAuthOptions(packageName, registrySettings) {
            const auth = resolvePublishAuth(registrySettings);
            if (auth.type !== 'npm-oidc') {
                return buildAuthOptions(auth, registrySettings).options;
            }

            const token = await exchangeToken(packageName, registrySettings, auth);
            return {
                ...createBaseOptions(registrySettings),
                forceAuth: { token }
            };
        }
    };
}
