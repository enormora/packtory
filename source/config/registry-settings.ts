import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

export const publishAuthType = {
    basic: 'basic',
    bearerToken: 'bearer-token',
    npmOidc: 'npm-oidc'
} as const;

export const oidcProvider = {
    auto: 'auto',
    env: 'env',
    githubActions: 'github-actions'
} as const;

export const metadataAuthMode = {
    anonymous: 'anonymous',
    auto: 'auto',
    inheritPublishAuth: 'inherit-publish-auth'
} as const;

const bearerTokenAuthSchema = z.readonly(
    z.strictObject({
        type: z.literal(publishAuthType.bearerToken),
        token: nonEmptyStringSchema
    })
);

const basicAuthSchema = z.readonly(
    z.strictObject({
        type: z.literal(publishAuthType.basic),
        username: nonEmptyStringSchema,
        password: nonEmptyStringSchema,
        email: z.optional(nonEmptyStringSchema)
    })
);

const npmOidcAuthSchema = z.readonly(
    z.strictObject({
        type: z.literal(publishAuthType.npmOidc),
        provider: z.optional(z.enum([oidcProvider.auto, oidcProvider.githubActions, oidcProvider.env])),
        idTokenEnvVar: z.optional(nonEmptyStringSchema)
    })
);

const publishAuthStrategySchema = z.discriminatedUnion('type', [
    bearerTokenAuthSchema,
    basicAuthSchema,
    npmOidcAuthSchema
]);

const metadataAuthStrategySchema = z.discriminatedUnion('type', [bearerTokenAuthSchema, basicAuthSchema]);

const metadataAuthModeSchema = z.union([
    z.literal(metadataAuthMode.auto),
    z.literal(metadataAuthMode.anonymous),
    z.literal(metadataAuthMode.inheritPublishAuth),
    metadataAuthStrategySchema
]);

const authConfigSchema = z.union([
    z.readonly(publishAuthStrategySchema),
    z.readonly(
        z.strictObject({
            publish: publishAuthStrategySchema,
            metadata: z.optional(metadataAuthModeSchema)
        })
    )
]);

export const registrySettingsSchema = z.readonly(
    z.strictObject({
        registryUrl: z.optional(nonEmptyStringSchema),
        auth: authConfigSchema
    })
);

export type PublishAuthStrategy = z.infer<typeof publishAuthStrategySchema>;
export type NpmOidcPublishAuth = Extract<PublishAuthStrategy, { type: typeof publishAuthType.npmOidc }>;
export type MetadataAuthStrategy = z.infer<typeof metadataAuthStrategySchema>;
export type MetadataAuthMode = z.infer<typeof metadataAuthModeSchema>;
export type RegistrySettings = z.infer<typeof registrySettingsSchema>;
