import type {
    MetadataAuthenticationMode,
    MetadataAuthenticationStrategy,
    PublishAuthenticationStrategy,
    RegistrySettings
} from './registry-settings.ts';

const redactedValue = '[redacted]';

type RedactedAuthentication = {
    readonly type: PublishAuthenticationStrategy['type'];
    readonly token?: string;
    readonly username?: string;
    readonly password?: string;
    readonly email?: string;
    readonly provider?: string;
    readonly identityTokenEnvironmentVariable?: string;
};

function redactPublishAuthentication(authentication: PublishAuthenticationStrategy): RedactedAuthentication {
    if (authentication.type === 'bearer-token') {
        return { type: 'bearer-token', token: redactedValue };
    }
    if (authentication.type === 'basic') {
        return {
            type: 'basic',
            username: authentication.username,
            password: redactedValue,
            ...authentication.email === undefined ? {} : { email: authentication.email }
        };
    }
    return {
        type: 'npm-open-identity-connect',
        ...authentication.provider === undefined ? {} : { provider: authentication.provider },
        ...authentication.identityTokenEnvironmentVariable === undefined
            ? {}
            : { identityTokenEnvironmentVariable: authentication.identityTokenEnvironmentVariable }
    };
}

type RedactedMetadata = { readonly mode: string; } | { readonly strategy: RedactedAuthentication; };
type ExpandedRegistryAuthentication = Extract<
    NonNullable<RegistrySettings['authentication']>,
    { readonly publish: PublishAuthenticationStrategy; }
>;

function isMetadataAuthenticationStrategy(
    metadata: MetadataAuthenticationMode
): metadata is MetadataAuthenticationStrategy {
    return typeof metadata !== 'string';
}

function isExpandedRegistryAuthentication(
    authentication: NonNullable<RegistrySettings['authentication']>
): authentication is ExpandedRegistryAuthentication {
    return Object.hasOwn(authentication, 'publish');
}

function redactMetadata(metadata: MetadataAuthenticationMode): RedactedMetadata {
    if (isMetadataAuthenticationStrategy(metadata)) {
        return { strategy: redactPublishAuthentication(metadata) };
    }
    return { mode: metadata };
}

export type RedactedRegistrySettings = {
    readonly registryAddress?: string;
    readonly authentication?: RedactedAuthentication | {
        readonly publish: RedactedAuthentication;
        readonly metadata?: RedactedMetadata;
    };
};

function redactAuthentication(
    authentication: NonNullable<RegistrySettings['authentication']>
): NonNullable<RedactedRegistrySettings['authentication']> {
    if (isExpandedRegistryAuthentication(authentication)) {
        return {
            publish: redactPublishAuthentication(authentication.publish),
            ...authentication.metadata === undefined ? {} : { metadata: redactMetadata(authentication.metadata) }
        };
    }
    return redactPublishAuthentication(authentication);
}

export function redactRegistrySettings(settings: RegistrySettings): RedactedRegistrySettings {
    return {
        ...settings.registryAddress === undefined ? {} : { registryAddress: settings.registryAddress },
        ...settings.authentication === undefined
            ? {}
            : { authentication: redactAuthentication(settings.authentication) }
    };
}
