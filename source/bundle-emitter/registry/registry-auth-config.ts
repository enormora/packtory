import type _npmFetch from 'npm-registry-fetch';
import type {
    MetadataAuthMode,
    MetadataAuthStrategy,
    PublishAuthStrategy,
    RegistrySettings
} from '../../config/registry-settings.ts';

export const npmRegistryUrl = 'https://registry.npmjs.org/';

export type NpmFetchOptions = Parameters<typeof _npmFetch>[1];

export type AuthResolution = {
    readonly allowsAutomaticRetry: boolean;
    readonly registry: string | undefined;
    readonly options: NpmFetchOptions;
};

export function resolveRegistryUrl(registrySettings: Readonly<RegistrySettings>): string | undefined {
    return registrySettings.registryUrl;
}

export function isNpmRegistry(registry: string | undefined): boolean {
    return new URL(registry ?? npmRegistryUrl).href === npmRegistryUrl;
}

const publishAuthRequiredErrorMessage =
    'registrySettings.auth must be configured to publish; this code path should be unreachable when auth is missing.';

export function resolvePublishAuth(registrySettings: Readonly<RegistrySettings>): PublishAuthStrategy {
    if (registrySettings.auth === undefined) {
        throw new Error(publishAuthRequiredErrorMessage);
    }
    return 'type' in registrySettings.auth ? registrySettings.auth : registrySettings.auth.publish;
}

export function createBaseOptions(registrySettings: Readonly<RegistrySettings>): NpmFetchOptions {
    return {
        alwaysAuth: true,
        registry: resolveRegistryUrl(registrySettings)
    };
}

export function buildAuthOptions(
    auth: MetadataAuthStrategy,
    registrySettings: Readonly<RegistrySettings>
): AuthResolution {
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
            ...(auth.email === undefined ? undefined : { email: auth.email })
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

function createAutomaticRetryAuthResolution(registrySettings: Readonly<RegistrySettings>): AuthResolution {
    return {
        ...createAnonymousAuthResolution(registrySettings),
        allowsAutomaticRetry: true
    };
}

function resolveInheritedMetadataAuth(
    publishAuth: PublishAuthStrategy,
    registrySettings: Readonly<RegistrySettings>
): AuthResolution {
    return publishAuth.type === 'npm-oidc'
        ? createAnonymousAuthResolution(registrySettings)
        : buildAuthOptions(publishAuth, registrySettings);
}

function resolveMetadataAuthFromMode(
    metadataMode: MetadataAuthMode | undefined,
    publishAuth: PublishAuthStrategy,
    registrySettings: Readonly<RegistrySettings>
): AuthResolution {
    if (metadataMode === 'auto') {
        return createAutomaticRetryAuthResolution(registrySettings);
    }
    if (metadataMode === 'anonymous') {
        return createAnonymousAuthResolution(registrySettings);
    }
    if (typeof metadataMode === 'object') {
        return buildAuthOptions(metadataMode, registrySettings);
    }
    return resolveInheritedMetadataAuth(publishAuth, registrySettings);
}

export function resolveMetadataAuthOptions(registrySettings: Readonly<RegistrySettings>): AuthResolution {
    if (registrySettings.auth === undefined) {
        return createAnonymousAuthResolution(registrySettings);
    }
    if ('type' in registrySettings.auth) {
        return resolveInheritedMetadataAuth(registrySettings.auth, registrySettings);
    }
    return resolveMetadataAuthFromMode(registrySettings.auth.metadata, registrySettings.auth.publish, registrySettings);
}
