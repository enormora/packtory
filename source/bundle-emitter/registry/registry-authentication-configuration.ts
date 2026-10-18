import type _npmFetch from 'npm-registry-fetch';
import type {
    MetadataAuthenticationMode,
    MetadataAuthenticationStrategy,
    PublishAuthenticationStrategy,
    RegistrySettings
} from '../../configuration/registry-settings.ts';

export const npmRegistryAddress = 'https://registry.npmjs.org/';

export type NpmFetchOptions = Readonly<NonNullable<Parameters<typeof _npmFetch>[1]>>;

export type AuthenticationResolution = {
    readonly authorization: string | undefined;
    readonly allowsAutomaticRetry: boolean;
    readonly registry: string | undefined;
    readonly options: NpmFetchOptions;
};

type RegistryAuthentication = NonNullable<RegistrySettings['authentication']>;
type SplitRegistryAuthentication = Extract<
    RegistryAuthentication,
    { readonly publish: PublishAuthenticationStrategy; }
>;

function isSplitRegistryAuthentication(
    authentication: RegistryAuthentication
): authentication is SplitRegistryAuthentication {
    return Object.hasOwn(authentication, 'publish');
}

export function resolveRegistryAddress(registrySettings: Readonly<RegistrySettings>): string | undefined {
    return registrySettings.registryAddress;
}

export function isNpmRegistry(registry: string | undefined): boolean {
    const resolvedRegistryAddress = new URL(registry ?? npmRegistryAddress);
    return resolvedRegistryAddress.href === npmRegistryAddress;
}

const publishAuthenticationRequiredErrorMessage = 'registrySettings.authentication must be configured to publish.';

export function resolvePublishAuthentication(
    registrySettings: Readonly<RegistrySettings>
): PublishAuthenticationStrategy {
    if (registrySettings.authentication === undefined) {
        throw new Error(publishAuthenticationRequiredErrorMessage);
    }
    return isSplitRegistryAuthentication(registrySettings.authentication)
        ? registrySettings.authentication.publish
        : registrySettings.authentication;
}

export function createBaseOptions(registrySettings: Readonly<RegistrySettings>): NpmFetchOptions {
    return {
        alwaysAuth: true,
        registry: resolveRegistryAddress(registrySettings)
    };
}

export function buildAuthenticationOptions(
    authentication: MetadataAuthenticationStrategy,
    registrySettings: Readonly<RegistrySettings>
): AuthenticationResolution {
    const registry = resolveRegistryAddress(registrySettings);
    const options = createBaseOptions(registrySettings);

    if (authentication.type === 'bearer-token') {
        return {
            authorization: `Bearer ${authentication.token}`,
            allowsAutomaticRetry: false,
            registry,
            options: {
                ...options,
                forceAuth: {
                    token: authentication.token
                }
            }
        };
    }

    const encodedCredentials = Buffer.from(`${authentication.username}:${authentication.password}`).toString('base64');
    return {
        authorization: `Basic ${encodedCredentials}`,
        allowsAutomaticRetry: false,
        registry,
        options: {
            ...options,
            forceAuth: {
                _auth: encodedCredentials
            },
            ...authentication.email === undefined ? undefined : { email: authentication.email }
        }
    };
}

function createAnonymousAuthenticationResolution(
    registrySettings: Readonly<RegistrySettings>
): AuthenticationResolution {
    return {
        authorization: undefined,
        allowsAutomaticRetry: false,
        registry: resolveRegistryAddress(registrySettings),
        options: createBaseOptions(registrySettings)
    };
}

function createAutomaticRetryAuthenticationResolution(
    registrySettings: Readonly<RegistrySettings>
): AuthenticationResolution {
    return {
        ...createAnonymousAuthenticationResolution(registrySettings),
        allowsAutomaticRetry: true
    };
}

function resolveInheritedMetadataAuthentication(
    publishAuthentication: PublishAuthenticationStrategy,
    registrySettings: Readonly<RegistrySettings>
): AuthenticationResolution {
    return publishAuthentication.type === 'npm-open-identity-connect'
        ? createAnonymousAuthenticationResolution(registrySettings)
        : buildAuthenticationOptions(publishAuthentication, registrySettings);
}

function resolveMetadataAuthenticationFromMode(
    metadataMode: MetadataAuthenticationMode | undefined,
    publishAuthentication: PublishAuthenticationStrategy,
    registrySettings: Readonly<RegistrySettings>
): AuthenticationResolution {
    if (metadataMode === 'automatic') {
        return createAutomaticRetryAuthenticationResolution(registrySettings);
    }
    if (metadataMode === 'anonymous') {
        return createAnonymousAuthenticationResolution(registrySettings);
    }
    if (typeof metadataMode === 'object') {
        return buildAuthenticationOptions(metadataMode, registrySettings);
    }
    return resolveInheritedMetadataAuthentication(publishAuthentication, registrySettings);
}

export function resolveMetadataAuthenticationOptions(
    registrySettings: Readonly<RegistrySettings>
): AuthenticationResolution {
    if (registrySettings.authentication === undefined) {
        return createAnonymousAuthenticationResolution(registrySettings);
    }
    if (isSplitRegistryAuthentication(registrySettings.authentication)) {
        return resolveMetadataAuthenticationFromMode(
            registrySettings.authentication.metadata,
            registrySettings.authentication.publish,
            registrySettings
        );
    }
    return resolveInheritedMetadataAuthentication(registrySettings.authentication, registrySettings);
}

const stagedVersionLookupRequiresTokenAuthenticationMessage =
    'npm staged publishing with automatic versioning requires token-based metadata auth ' +
    'when publish auth uses npm-oidc';

export function resolveStageListingAuthenticationOptions(
    registrySettings: Readonly<RegistrySettings>
): AuthenticationResolution {
    const { authentication } = registrySettings;
    if (authentication === undefined) {
        throw new Error(publishAuthenticationRequiredErrorMessage);
    }

    const publishAuthentication = isSplitRegistryAuthentication(authentication)
        ? authentication.publish
        : authentication;

    if (isSplitRegistryAuthentication(authentication) && typeof authentication.metadata === 'object') {
        return buildAuthenticationOptions(authentication.metadata, registrySettings);
    }

    if (publishAuthentication.type === 'npm-open-identity-connect') {
        throw new Error(stagedVersionLookupRequiresTokenAuthenticationMessage);
    }

    return buildAuthenticationOptions(publishAuthentication, registrySettings);
}
