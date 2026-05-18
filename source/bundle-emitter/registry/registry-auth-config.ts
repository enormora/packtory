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

export function resolvePublishAuth(registrySettings: Readonly<RegistrySettings>): PublishAuthStrategy {
    return normalizeAuthConfig(registrySettings).publish;
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

export function resolveMetadataAuthOptions(registrySettings: Readonly<RegistrySettings>): AuthResolution {
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
