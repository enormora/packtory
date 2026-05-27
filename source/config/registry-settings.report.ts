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
            ...(auth.email === undefined ? {} : { email: auth.email })
        };
    }
    return {
        type: 'npm-oidc',
        ...(auth.provider === undefined ? {} : { provider: auth.provider }),
        ...(auth.idTokenEnvVar === undefined ? {} : { idTokenEnvVar: auth.idTokenEnvVar })
    };
}

type RedactedMetadata = { readonly mode: string } | { readonly strategy: RedactedAuth };

function redactMetadata(metadata: MetadataAuthMode): RedactedMetadata {
    if (typeof metadata === 'string') {
        return { mode: metadata };
    }
    return { strategy: redactPublishAuth(metadata satisfies MetadataAuthStrategy) };
}

export type RedactedRegistrySettings = {
    readonly registryUrl?: string;
    readonly auth: RedactedAuth | { readonly publish: RedactedAuth; readonly metadata?: RedactedMetadata };
};

function redactAuth(auth: RegistrySettings['auth']): RedactedRegistrySettings['auth'] {
    if ('publish' in auth) {
        return {
            publish: redactPublishAuth(auth.publish),
            ...(auth.metadata === undefined ? {} : { metadata: redactMetadata(auth.metadata) })
        };
    }
    return redactPublishAuth(auth);
}

export function redactRegistrySettings(settings: RegistrySettings): RedactedRegistrySettings {
    return {
        ...(settings.registryUrl === undefined ? {} : { registryUrl: settings.registryUrl }),
        auth: redactAuth(settings.auth)
    };
}
