import type _npmFetch from 'npm-registry-fetch';
import {
    metadataAuthMode,
    publishAuthType,
    type MetadataAuthStrategy,
    type PublishAuthStrategy,
    type RegistrySettings
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

export function resolvePublishAuth(registrySettings: Readonly<RegistrySettings>): PublishAuthStrategy {
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

    if (auth.type === publishAuthType.bearerToken) {
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
    return publishAuth.type === publishAuthType.npmOidc
        ? createAnonymousAuthResolution(registrySettings)
        : buildAuthOptions(publishAuth, registrySettings);
}

export function resolveMetadataAuthOptions(registrySettings: Readonly<RegistrySettings>): AuthResolution {
    if ('type' in registrySettings.auth) {
        return resolveInheritedMetadataAuth(registrySettings.auth, registrySettings);
    }

    const metadataMode = registrySettings.auth.metadata;
    if (metadataMode === metadataAuthMode.auto) {
        return createAutomaticRetryAuthResolution(registrySettings);
    }

    if (metadataMode === metadataAuthMode.anonymous) {
        return createAnonymousAuthResolution(registrySettings);
    }

    if (typeof metadataMode === 'object') {
        return buildAuthOptions(metadataMode, registrySettings);
    }

    return resolveInheritedMetadataAuth(registrySettings.auth.publish, registrySettings);
}
