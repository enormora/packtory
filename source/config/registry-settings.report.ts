import type {
    MetadataAuthMode,
    MetadataAuthStrategy,
    PublishAuthStrategy,
    RegistrySettings
} from './registry-settings.ts';

const redactedValue = '[redacted]';

type RedactedAuth = {
    readonly type: PublishAuthStrategy['type'];
    readonly token?: string;
    readonly username?: string;
    readonly password?: string;
    readonly email?: string;
    readonly provider?: string;
    readonly idTokenEnvVar?: string;
};

function redactPublishAuth(auth: PublishAuthStrategy): RedactedAuth {
    if (auth.type === 'bearer-token') {
        return { type: 'bearer-token', token: redactedValue };
    }
    if (auth.type === 'basic') {
        return {
            type: 'basic',
            username: auth.username,
            password: redactedValue,
            ...auth.email !== undefined && { email: auth.email }
        };
    }
    return {
        type: 'npm-oidc',
        ...auth.provider !== undefined && { provider: auth.provider },
        ...auth.idTokenEnvVar !== undefined && { idTokenEnvVar: auth.idTokenEnvVar }
    };
}

type RedactedMetadata = { readonly mode: string; } | { readonly strategy: RedactedAuth; };
type ExpandedRegistryAuth = Extract<NonNullable<RegistrySettings['auth']>, { readonly publish: PublishAuthStrategy; }>;

function isMetadataAuthStrategy(metadata: MetadataAuthMode): metadata is MetadataAuthStrategy {
    return typeof metadata !== 'string';
}

function isExpandedRegistryAuth(auth: NonNullable<RegistrySettings['auth']>): auth is ExpandedRegistryAuth {
    return Object.hasOwn(auth, 'publish');
}

function redactMetadata(metadata: MetadataAuthMode): RedactedMetadata {
    if (isMetadataAuthStrategy(metadata)) {
        return { strategy: redactPublishAuth(metadata) };
    }
    return { mode: metadata };
}

export type RedactedRegistrySettings = {
    readonly registryUrl?: string;
    readonly auth?: RedactedAuth | { readonly publish: RedactedAuth; readonly metadata?: RedactedMetadata; };
};

function redactAuth(auth: NonNullable<RegistrySettings['auth']>): NonNullable<RedactedRegistrySettings['auth']> {
    if (isExpandedRegistryAuth(auth)) {
        return {
            publish: redactPublishAuth(auth.publish),
            ...auth.metadata !== undefined && { metadata: redactMetadata(auth.metadata) }
        };
    }
    return redactPublishAuth(auth);
}

export function redactRegistrySettings(settings: RegistrySettings): RedactedRegistrySettings {
    return {
        ...settings.registryUrl !== undefined && { registryUrl: settings.registryUrl },
        ...settings.auth !== undefined && { auth: redactAuth(settings.auth) }
    };
}
