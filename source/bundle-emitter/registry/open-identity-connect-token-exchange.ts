import type { Clock } from '../../common/clock.ts';
import type {
    NpmOpenIdentityConnectPublishAuthentication,
    RegistrySettings
} from '../../configuration/registry-settings.ts';
import {
    buildAuthenticationOptions,
    createBaseOptions,
    isNpmRegistry,
    npmRegistryAddress,
    resolvePublishAuthentication,
    resolveRegistryAddress,
    type NpmFetchOptions
} from './registry-authentication-configuration.ts';
import { toRegistryPackagePath } from './registry-package-path.ts';
import { parseOpenIdentityConnectExchangeResponse } from './registry-response-schemas.ts';

const openIdentityConnectExchangeRefreshThresholdInMilliseconds = 60_000;

type OpenIdentityConnectExchangeToken = {
    readonly token: string;
    readonly expiresAt: number;
};

type ParsedOpenIdentityConnectExchangeToken = {
    readonly token: string;
    readonly expiresAt: number;
};

type OpenIdentityConnectExchangerDependencies = {
    readonly fetch: typeof globalThis.fetch;
    readonly clock: Clock;
    readonly resolveIdentifierToken: (authentication: NpmOpenIdentityConnectPublishAuthentication) => Promise<string>;
};

export type OpenIdentityConnectTokenExchanger = {
    exchangeToken: (
        packageName: string,
        registrySettings: Readonly<RegistrySettings>,
        authentication: NpmOpenIdentityConnectPublishAuthentication
    ) => Promise<string>;
    resolveWriteAuthenticationOptions: (
        packageName: string,
        registrySettings: Readonly<RegistrySettings>
    ) => Promise<NpmFetchOptions>;
};

export function createOpenIdentityConnectTokenExchanger(
    dependencies: OpenIdentityConnectExchangerDependencies
): OpenIdentityConnectTokenExchanger {
    const { fetch: fetchImplementation, clock, resolveIdentifierToken } = dependencies;
    const cache = new Map<string, OpenIdentityConnectExchangeToken>();

    function getCacheKey(packageName: string, registrySettings: Readonly<RegistrySettings>): string {
        return `${resolveRegistryAddress(registrySettings) ?? npmRegistryAddress}::${packageName}`;
    }

    function readCachedToken(cacheKey: string): string | undefined {
        const cachedToken = cache.get(cacheKey);
        if (cachedToken === undefined) {
            return undefined;
        }

        const currentTime = clock.getCurrentTimeInMilliseconds();
        if (cachedToken.expiresAt - currentTime > openIdentityConnectExchangeRefreshThresholdInMilliseconds) {
            return cachedToken.token;
        }
        return undefined;
    }

    function parseExchangedToken(body: unknown): ParsedOpenIdentityConnectExchangeToken {
        const parsed = parseOpenIdentityConnectExchangeResponse(body);
        if (!parsed.success) {
            throw new TypeError(`OIDC token exchange returned an invalid response: ${parsed.issues.join('; ')}`);
        }
        return { token: parsed.data.token, expiresAt: parsed.data.expires.getTime() };
    }

    async function requestExchange(
        packageName: string,
        authentication: NpmOpenIdentityConnectPublishAuthentication
    ): Promise<ParsedOpenIdentityConnectExchangeToken> {
        const identifierToken = await resolveIdentifierToken(authentication);
        const requestInitialization: RequestInit = {
            method: 'POST',
            headers: { Authorization: `Bearer ${identifierToken}` }
        };
        const exchangeResponse = await fetchImplementation(
            `${npmRegistryAddress}-/npm/v1/oidc/token/exchange/package/${toRegistryPackagePath(packageName)}`,
            requestInitialization
        );
        if (!exchangeResponse.ok) {
            throw new Error(`OIDC token exchange failed with status ${exchangeResponse.status}`);
        }
        return parseExchangedToken((await exchangeResponse.json()) as unknown);
    }

    async function exchangeToken(
        packageName: string,
        registrySettings: Readonly<RegistrySettings>,
        authentication: NpmOpenIdentityConnectPublishAuthentication
    ): Promise<string> {
        const cacheKey = getCacheKey(packageName, registrySettings);
        const cached = readCachedToken(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        if (!isNpmRegistry(resolveRegistryAddress(registrySettings))) {
            throw new Error('npm-oidc auth is only supported with the npmjs.org registry');
        }

        const exchanged = await requestExchange(packageName, authentication);
        cache.set(cacheKey, exchanged);
        return exchanged.token;
    }

    return {
        exchangeToken,

        async resolveWriteAuthenticationOptions(packageName, registrySettings) {
            const authentication = resolvePublishAuthentication(registrySettings);
            if (authentication.type !== 'npm-open-identity-connect') {
                return buildAuthenticationOptions(authentication, registrySettings).options;
            }

            const token = await exchangeToken(packageName, registrySettings, authentication);
            return {
                ...createBaseOptions(registrySettings),
                forceAuth: { token }
            };
        }
    };
}
