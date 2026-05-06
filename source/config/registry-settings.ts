import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

const bearerTokenAuthSchema = z.readonly(
    z.strictObject({
        type: z.literal('bearer-token'),
        token: nonEmptyStringSchema
    })
);

const basicAuthSchema = z.readonly(
    z.strictObject({
        type: z.literal('basic'),
        username: nonEmptyStringSchema,
        password: nonEmptyStringSchema,
        email: z.optional(nonEmptyStringSchema)
    })
);

const npmOidcAuthSchema = z.readonly(
    z.strictObject({
        type: z.literal('npm-oidc'),
        provider: z.optional(z.enum(['auto', 'github-actions', 'env'])),
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
    z.literal('auto'),
    z.literal('anonymous'),
    z.literal('inherit-publish-auth'),
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
export type MetadataAuthStrategy = z.infer<typeof metadataAuthStrategySchema>;
export type MetadataAuthMode = z.infer<typeof metadataAuthModeSchema>;
export type RegistryAuthConfig = z.infer<typeof authConfigSchema>;
export type RegistrySettings = z.infer<typeof registrySettingsSchema>;
