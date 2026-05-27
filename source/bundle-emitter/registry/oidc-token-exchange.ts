import type { Clock } from '../../common/clock.ts';
import { publishAuthType, type NpmOidcPublishAuth, type RegistrySettings } from '../../config/registry-settings.ts';
import {
    buildAuthOptions,
    createBaseOptions,
    isNpmRegistry,
    npmRegistryUrl,
    resolvePublishAuth,
    resolveRegistryUrl,
    type NpmFetchOptions
} from './registry-auth-config.ts';
import { toRegistryPackagePath } from './registry-package-path.ts';
import { parseOidcExchangeResponse } from './registry-response-schemas.ts';

const oidcExchangeRefreshThresholdInMilliseconds = 60_000;

type OidcExchangeToken = {
    readonly token: string;
    readonly expiresAt: number;
};

type OidcExchangerDependencies = {
    readonly fetch: typeof globalThis.fetch;
    readonly clock: Clock;
    readonly resolveIdToken: (auth: NpmOidcPublishAuth) => Promise<string>;
};

export type OidcTokenExchanger = {
    exchangeToken: (
        packageName: string,
        registrySettings: Readonly<RegistrySettings>,
        auth: NpmOidcPublishAuth
    ) => Promise<string>;
    resolveWriteAuthOptions: (
        packageName: string,
        registrySettings: Readonly<RegistrySettings>
    ) => Promise<NpmFetchOptions>;
};

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

    function parseExchangedToken(body: unknown): { readonly token: string; readonly expiresAt: number } {
        const parsed = parseOidcExchangeResponse(body);
        if (!parsed.success) {
            throw new TypeError(`OIDC token exchange returned an invalid response: ${parsed.issues.join('; ')}`);
        }
        return { token: parsed.data.token, expiresAt: parsed.data.expires.getTime() };
    }

    async function requestExchange(
        packageName: string,
        auth: NpmOidcPublishAuth
    ): Promise<{ readonly token: string; readonly expiresAt: number }> {
        const idToken = await resolveIdToken(auth);
        const exchangeResponse = await fetchImplementation(
            `${npmRegistryUrl}-/npm/v1/oidc/token/exchange/package/${toRegistryPackagePath(packageName)}`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` }
            } satisfies RequestInit
        );
        if (!exchangeResponse.ok) {
            throw new Error(`OIDC token exchange failed with status ${exchangeResponse.status}`);
        }
        return parseExchangedToken((await exchangeResponse.json()) as unknown);
    }

    async function exchangeToken(
        packageName: string,
        registrySettings: Readonly<RegistrySettings>,
        auth: NpmOidcPublishAuth
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
            if (auth.type !== publishAuthType.npmOidc) {
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
