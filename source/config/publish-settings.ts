import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';
import { sbomSettingsSchema } from './sbom-settings.ts';

const provenanceConfigSchema = z.readonly(
    z.discriminatedUnion('type', [
        z.strictObject({
            type: z.literal('auto')
        }),
        z.strictObject({
            type: z.literal('file'),
            path: nonEmptyStringSchema
        })
    ])
);

export const publishSettingsSchema = z.readonly(
    z.discriminatedUnion('access', [
        z.strictObject({
            access: z.literal('public'),
            provenance: z.optional(provenanceConfigSchema),
            sbom: z.optional(sbomSettingsSchema),
            allowScripts: z.optional(z.boolean())
        }),
        z.strictObject({
            access: z.literal('restricted'),
            sbom: z.optional(sbomSettingsSchema),
            allowScripts: z.optional(z.boolean())
        })
    ])
);

export type PublishSettings = z.infer<typeof publishSettingsSchema>;
export type PublicPublishSettings = Extract<PublishSettings, { readonly access: 'public'; }>;
