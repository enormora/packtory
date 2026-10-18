import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';
import { softwareBillOfMaterialsSettingsSchema } from './software-bill-of-materials-settings.ts';

const provenanceConfigurationSchema = z.readonly(
    z.discriminatedUnion('type', [
        z.strictObject({
            type: z.literal('automatic')
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
            provenance: z.optional(provenanceConfigurationSchema),
            softwareBillOfMaterials: z.optional(softwareBillOfMaterialsSettingsSchema),
            allowScripts: z.optional(z.boolean())
        }),
        z.strictObject({
            access: z.literal('restricted'),
            softwareBillOfMaterials: z.optional(softwareBillOfMaterialsSettingsSchema),
            allowScripts: z.optional(z.boolean())
        })
    ])
);

export type PublishSettings = z.infer<typeof publishSettingsSchema>;
export type PublicPublishSettings = Extract<PublishSettings, { readonly access: 'public'; }>;
