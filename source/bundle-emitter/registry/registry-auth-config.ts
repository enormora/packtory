import type _npmFetch from 'npm-registry-fetch';
import type {
    MetadataAuthMode,
    MetadataAuthStrategy,
    PublishAuthStrategy,
    RegistrySettings
} from '../../config/registry-settings.ts';

export const npmRegistryUrl = 'https://registry.npmjs.org/';

export type NpmFetchOptions = Readonly<NonNullable<Parameters<typeof _npmFetch>[1]>>;

export type AuthResolution = {
    readonly allowsAutomaticRetry: boolean;
    readonly registry: string | undefined;
    readonly options: NpmFetchOptions;
};

type RegistryAuth = NonNullable<RegistrySettings['auth']>;
type SplitRegistryAuth = Extract<RegistryAuth, { readonly publish: PublishAuthStrategy; }>;

function isSplitRegistryAuth(auth: RegistryAuth): auth is SplitRegistryAuth {
    return Object.hasOwn(auth, 'publish');
}

export function resolveRegistryUrl(registrySettings: Readonly<RegistrySettings>): string | undefined {
    return registrySettings.registryUrl;
}

export function isNpmRegistry(registry: string | undefined): boolean {
    const resolvedRegistryUrl = new URL(registry ?? npmRegistryUrl);
    return resolvedRegistryUrl.href === npmRegistryUrl;
}

const publishAuthRequiredErrorMessage =
    'registrySettings.auth must be configured to publish; this code path should be unreachable when auth is missing.';

export function resolvePublishAuth(registrySettings: Readonly<RegistrySettings>): PublishAuthStrategy {
    if (registrySettings.auth === undefined) {
        throw new Error(publishAuthRequiredErrorMessage);
    }
    return isSplitRegistryAuth(registrySettings.auth) ? registrySettings.auth.publish : registrySettings.auth;
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
            ...auth.email === undefined ? undefined : { email: auth.email }
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
    if (isSplitRegistryAuth(registrySettings.auth)) {
        return resolveMetadataAuthFromMode(
            registrySettings.auth.metadata,
            registrySettings.auth.publish,
            registrySettings
        );
    }
    return resolveInheritedMetadataAuth(registrySettings.auth, registrySettings);
}

const stagedVersionLookupRequiresTokenAuthMessage =
    'npm staged publishing with automatic versioning requires token-based metadata auth ' +
    'when publish auth uses npm-oidc';

export function resolveStageListingAuthOptions(registrySettings: Readonly<RegistrySettings>): AuthResolution {
    const { auth } = registrySettings;
    if (auth === undefined) {
        throw new Error(publishAuthRequiredErrorMessage);
    }

    const publishAuth = isSplitRegistryAuth(auth) ? auth.publish : auth;

    if (isSplitRegistryAuth(auth) && typeof auth.metadata === 'object') {
        return buildAuthOptions(auth.metadata, registrySettings);
    }

    if (publishAuth.type === 'npm-oidc') {
        throw new Error(stagedVersionLookupRequiresTokenAuthMessage);
    }

    return buildAuthOptions(publishAuth, registrySettings);
}
