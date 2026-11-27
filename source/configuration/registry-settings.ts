import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

const bearerTokenAuthenticationSchema = z.readonly(
    z.strictObject({
        type: z.literal('bearer-token'),
        token: nonEmptyStringSchema
    })
);

const basicAuthenticationSchema = z.readonly(
    z.strictObject({
        type: z.literal('basic'),
        username: nonEmptyStringSchema,
        password: nonEmptyStringSchema,
        email: z.optional(nonEmptyStringSchema)
    })
);

const npmOpenIdentityConnectAuthenticationFields = {
    type: z.literal('npm-open-identity-connect'),
    provider: z.optional(z.enum([ 'automatic', 'github-actions', 'environment' ])),
    identityTokenEnvironmentVariable: z.optional(nonEmptyStringSchema)
};
const npmOpenIdentityConnectAuthenticationSchema = z.readonly(
    z.strictObject(npmOpenIdentityConnectAuthenticationFields)
);

const publishAuthenticationStrategySchema = z.discriminatedUnion('type', [
    bearerTokenAuthenticationSchema,
    basicAuthenticationSchema,
    npmOpenIdentityConnectAuthenticationSchema
]);

const metadataAuthenticationStrategySchema = z.discriminatedUnion('type', [
    bearerTokenAuthenticationSchema,
    basicAuthenticationSchema
]);

const metadataAuthenticationModeSchema = z.union([
    z.literal('automatic'),
    z.literal('anonymous'),
    z.literal('inherit-publish-authentication'),
    metadataAuthenticationStrategySchema
]);

const publishAndMetadataAuthenticationFields = {
    publish: publishAuthenticationStrategySchema,
    metadata: z.optional(metadataAuthenticationModeSchema)
};
const authenticationConfigurationSchema = z.union([
    z.readonly(publishAuthenticationStrategySchema),
    z.readonly(
        z.strictObject(publishAndMetadataAuthenticationFields)
    )
]);

export const registrySettingsSchema = z.readonly(
    z.strictObject({
        registryAddress: z.optional(nonEmptyStringSchema),
        authentication: z.optional(authenticationConfigurationSchema)
    })
);

export type PublishAuthenticationStrategy = z.infer<typeof publishAuthenticationStrategySchema>;
export type NpmOpenIdentityConnectPublishAuthentication = Extract<
    PublishAuthenticationStrategy,
    { readonly type: 'npm-open-identity-connect'; }
>;
export type MetadataAuthenticationStrategy = z.infer<typeof metadataAuthenticationStrategySchema>;
export type MetadataAuthenticationMode = z.infer<typeof metadataAuthenticationModeSchema>;
export type RegistrySettings = z.infer<typeof registrySettingsSchema>;
