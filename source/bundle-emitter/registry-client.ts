/* eslint-disable complexity, max-statements -- response parsing intentionally validates the full registry payload in one place */
import type _npmFetch from 'npm-registry-fetch';
import type { publish as _publish } from 'libnpmpublish';
import { Maybe } from 'true-myth';
import { z } from 'zod/mini';
import type { Clock } from '../common/clock.ts';
import type {
    MetadataAuthMode,
    MetadataAuthStrategy,
    PublishAuthStrategy,
    RegistrySettings
} from '../config/registry-settings.ts';
import type { BundlePackageJson } from '../version-manager/versioned-bundle.ts';

type PublishFunction = typeof _publish;
const notFoundStatusCode = 404;
const unauthorizedStatusCode = 401;
const forbiddenStatusCode = 403;
const npmRegistryUrl = 'https://registry.npmjs.org/';
const oidcExchangeRefreshThresholdInMilliseconds = 60_000;

type OidcExchangeResponse = {
    readonly token_type: string;
    readonly token: string;
    readonly created: string;
    readonly expires: string;
};

type OidcExchangeToken = {
    readonly token: string;
    readonly expiresAt: number;
};

export type RegistryClientDependencies = {
    readonly npmFetch: typeof _npmFetch;
    readonly publish: PublishFunction;
    readonly fetch: typeof globalThis.fetch;
    readonly clock: Clock;
    readonly resolveIdToken: (auth: Extract<PublishAuthStrategy, { type: 'npm-oidc' }>) => Promise<string>;
    readonly promptForOneTimePassword?: (() => Promise<string | undefined>) | undefined;
};

export type RegistryClient = {
    fetchLatestVersion: (packageName: string, config: RegistrySettings) => Promise<Maybe<PackageVersionDetails>>;
    publishPackage: (manifest: Readonly<BundlePackageJson>, tarData: Buffer, config: RegistrySettings) => Promise<void>;
    fetchTarball: (tarballUrl: string, shasum: string, config: RegistrySettings) => Promise<Buffer>;
};

type NpmFetchOptions = Parameters<typeof _npmFetch>[1];
type AuthResolution = {
    readonly allowsAutomaticRetry: boolean;
    readonly registry: string | undefined;
    readonly options: NpmFetchOptions;
};

const packageVersionDetailsSchema = z.object({
    dist: z.object({
        shasum: z.string(),
        tarball: z.string()
    })
});

const abbreviatedPackageResponseSchema = z.object({
    name: z.string(),
    'dist-tags': z.object({
        latest: z.optional(z.string())
    }),
    versions: z.record(z.string(), packageVersionDetailsSchema)
});

const oidcExchangeResponseSchema = z.object({
    token_type: z.string(),
    token: z.string(),
    created: z.string(),
    expires: z.string()
});

function encodePackageName(name: string): string {
    return name.replace('/', '%2F');
}

type AbbreviatedPackageResponse = {
    readonly name: string;
    readonly 'dist-tags': {
        readonly latest?: string | undefined;
    };
    readonly versions: Readonly<
        Record<string, { readonly dist: { readonly shasum: string; readonly tarball: string } }>
    >;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value instanceof Object;
}

function parseAbbreviatedPackageResponse(response: unknown): AbbreviatedPackageResponse | undefined {
    const result = abbreviatedPackageResponseSchema.safeParse(response);
    return result.success ? result.data : undefined;
}

export type PackageVersionDetails = {
    readonly version: string;
    readonly shasum: string;
    readonly tarballUrl: string;
};

type PublishManifest = Readonly<Parameters<PublishFunction>[0]>;

function toPublishManifest(manifest: Readonly<BundlePackageJson>): PublishManifest {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- libnpmpublish expects @npm/types PackageJson, which is structurally compatible with our validated manifest
    return manifest as unknown as PublishManifest;
}

function resolveRegistryUrl(registrySettings: Readonly<RegistrySettings>): string | undefined {
    return registrySettings.registryUrl;
}

function isNpmRegistry(registry: string | undefined): boolean {
    return new URL(registry ?? npmRegistryUrl).href === npmRegistryUrl;
}

function normalizeAuthConfig(registrySettings: Readonly<RegistrySettings>): {
    readonly publish: PublishAuthStrategy;
    readonly metadata: MetadataAuthMode | undefined;
} {
    if ('type' in registrySettings.auth) {
        return {
            publish: registrySettings.auth,
            metadata: undefined
        };
    }

    return {
        publish: registrySettings.auth.publish,
        metadata: registrySettings.auth.metadata
    };
}

function resolvePublishAuth(registrySettings: Readonly<RegistrySettings>): PublishAuthStrategy {
    return normalizeAuthConfig(registrySettings).publish;
}

function createBaseOptions(registrySettings: Readonly<RegistrySettings>): NpmFetchOptions {
    return {
        alwaysAuth: true,
        registry: resolveRegistryUrl(registrySettings)
    };
}

function buildAuthOptions(auth: MetadataAuthStrategy, registrySettings: Readonly<RegistrySettings>): AuthResolution {
    const registry = resolveRegistryUrl(registrySettings);
    const options = createBaseOptions(registrySettings);

    if (auth.type === 'bearer-token') {
        return {
            allowsAutomaticRetry: false,
            registry,
            options: {
                ...options,
                forceAuth: {
                    token: auth.token
                }
            }
        };
    }

    return {
        allowsAutomaticRetry: false,
        registry,
        options: {
            ...options,
            forceAuth: {
                _auth: Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
            },
            ...(auth.email === undefined ? {} : { email: auth.email })
        }
    };
}

function createAnonymousAuthResolution(registrySettings: Readonly<RegistrySettings>): AuthResolution {
    return {
        allowsAutomaticRetry: false,
        registry: resolveRegistryUrl(registrySettings),
        options: createBaseOptions(registrySettings)
    };
}

function parseOidcExchangeResponse(response: unknown): OidcExchangeResponse | undefined {
    const result = oidcExchangeResponseSchema.safeParse(response);
    return result.success ? result.data : undefined;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
    return response.json() as Promise<unknown>;
}

export function createRegistryClient(dependencies: Readonly<RegistryClientDependencies>): RegistryClient {
    const {
        npmFetch,
        publish,
        fetch: fetchImplementation,
        clock,
        promptForOneTimePassword,
        resolveIdToken
    } = dependencies;
    const oidcExchangeTokenCache = new Map<string, OidcExchangeToken>();

    async function exchangeOidcToken(
        packageName: string,
        registrySettings: Readonly<RegistrySettings>,
        auth: Extract<PublishAuthStrategy, { type: 'npm-oidc' }>
    ): Promise<string> {
        const cacheKey = `${resolveRegistryUrl(registrySettings) ?? npmRegistryUrl}::${packageName}`;
        const cachedToken = oidcExchangeTokenCache.get(cacheKey);
        const currentTime = clock.getCurrentTimeInMilliseconds();
        if (
            cachedToken !== undefined &&
            cachedToken.expiresAt - currentTime > oidcExchangeRefreshThresholdInMilliseconds
        ) {
            return cachedToken.token;
        }

        if (!isNpmRegistry(resolveRegistryUrl(registrySettings))) {
            throw new Error('npm-oidc auth is only supported with the npmjs.org registry');
        }

        const idToken = await resolveIdToken(auth);
        const exchangeResponse = await fetchImplementation(
            `${npmRegistryUrl}-/npm/v1/oidc/token/exchange/package/${encodePackageName(packageName)}`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` }
            } satisfies RequestInit
        );

        if (!exchangeResponse.ok) {
            throw new Error(`OIDC token exchange failed with status ${exchangeResponse.status}`);
        }

        const body = parseOidcExchangeResponse(await parseJsonResponse(exchangeResponse));
        if (body === undefined) {
            throw new TypeError('OIDC token exchange returned an invalid response');
        }

        const expiresAt = Date.parse(body.expires);
        if (!Number.isFinite(expiresAt)) {
            throw new TypeError('OIDC token exchange returned an invalid expiry timestamp');
        }

        oidcExchangeTokenCache.set(cacheKey, {
            token: body.token,
            expiresAt
        });

        return body.token;
    }

    async function resolveWriteAuthOptions(
        packageName: string,
        registrySettings: Readonly<RegistrySettings>
    ): Promise<NpmFetchOptions> {
        const auth = resolvePublishAuth(registrySettings);
        if (auth.type !== 'npm-oidc') {
            return buildAuthOptions(auth, registrySettings).options;
        }

        const token = await exchangeOidcToken(packageName, registrySettings, auth);
        return {
            ...createBaseOptions(registrySettings),
            forceAuth: {
                token
            }
        };
    }

    function resolveMetadataAuthOptions(registrySettings: Readonly<RegistrySettings>): AuthResolution {
        const { metadata: metadataMode, publish: publishAuth } = normalizeAuthConfig(registrySettings);
        if (metadataMode === undefined || metadataMode === 'inherit-publish-auth') {
            if (publishAuth.type === 'npm-oidc') {
                return createAnonymousAuthResolution(registrySettings);
            }

            return buildAuthOptions(publishAuth, registrySettings);
        }

        if (metadataMode === 'auto') {
            return {
                ...createAnonymousAuthResolution(registrySettings),
                allowsAutomaticRetry: true
            };
        }

        if (typeof metadataMode !== 'object') {
            return createAnonymousAuthResolution(registrySettings);
        }

        return buildAuthOptions(metadataMode, registrySettings);
    }

    async function retryAutoMetadataAuth<T>(
        registrySettings: Readonly<RegistrySettings>,
        auth: AuthResolution,
        run: (options: NpmFetchOptions) => Promise<T>
    ): Promise<T> {
        try {
            return await run(auth.options);
        } catch (error: unknown) {
            const statusCode = isRecord(error) ? error.statusCode : undefined;
            if (
                !auth.allowsAutomaticRetry ||
                (statusCode !== forbiddenStatusCode && statusCode !== unauthorizedStatusCode)
            ) {
                throw error;
            }

            const publishAuth = resolvePublishAuth(registrySettings);
            if (publishAuth.type === 'npm-oidc') {
                throw error;
            }

            return run(buildAuthOptions(publishAuth, registrySettings).options);
        }
    }

    async function fetchRegistryEndpoint(
        endpoint: string,
        registrySettings: Readonly<RegistrySettings>
    ): Promise<unknown> {
        const acceptHeaderForFetchingAbbreviatedResponse = 'application/vnd.npm.install-v1+json';
        const auth = resolveMetadataAuthOptions(registrySettings);

        return retryAutoMetadataAuth(registrySettings, auth, async (options) => {
            return npmFetch.json(endpoint, {
                ...options,
                headers: { accept: acceptHeaderForFetchingAbbreviatedResponse }
            });
        });
    }

    async function fetchPackage(
        packageName: string,
        registrySettings: RegistrySettings
    ): Promise<Maybe<AbbreviatedPackageResponse>> {
        const endpointUri = `/${encodePackageName(packageName)}`;
        try {
            const response = await fetchRegistryEndpoint(endpointUri, registrySettings);
            const result = parseAbbreviatedPackageResponse(response);

            if (result === undefined) {
                throw new Error('Got an invalid response from registry API');
            }

            return Maybe.just(result);
        } catch (error: unknown) {
            const statusCode = isRecord(error) ? error.statusCode : undefined;
            if (statusCode === notFoundStatusCode || statusCode === forbiddenStatusCode) {
                return Maybe.nothing();
            }

            throw error;
        }
    }

    return {
        async fetchTarball(tarballUrl, _shasum, registrySettings) {
            const auth = resolveMetadataAuthOptions(registrySettings);
            const response = await retryAutoMetadataAuth(registrySettings, auth, async (options) => {
                return npmFetch(tarballUrl, options);
            });
            return response.buffer();
        },

        async publishPackage(manifest, tarData, registrySettings) {
            const authOptions = await resolveWriteAuthOptions(manifest.name, registrySettings);
            await publish(toPublishManifest(manifest), tarData, {
                defaultTag: 'latest',
                ...authOptions,
                ...(promptForOneTimePassword === undefined ? {} : { otpPrompt: promptForOneTimePassword })
            });
        },

        async fetchLatestVersion(packageName, registrySettings) {
            const packageResponse = await fetchPackage(packageName, registrySettings);

            if (packageResponse.isNothing) {
                return Maybe.nothing();
            }

            const latestVersion = packageResponse.value['dist-tags'].latest;
            if (latestVersion !== undefined) {
                const versionData = packageResponse.value.versions[latestVersion];
                if (versionData === undefined) {
                    throw new Error(`Version "${latestVersion}" for package "${packageName}" is missing a shasum`);
                }

                return Maybe.just({
                    version: latestVersion,
                    shasum: versionData.dist.shasum,
                    tarballUrl: versionData.dist.tarball
                });
            }

            return Maybe.nothing();
        }
    };
}
