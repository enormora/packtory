import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';
import { softwareBillOfMaterialsSettingsSchema } from './software-bill-of-materials-settings.ts';

const provenanceConfigurationFields = {
    type: z.literal('automatic')
};
const provenanceConfigurationVariantsSchema = z.discriminatedUnion('type', [
    z.strictObject(provenanceConfigurationFields),
    z.strictObject({
        type: z.literal('file'),
        path: nonEmptyStringSchema
    })
]);
const provenanceConfigurationSchema = z.readonly(
    provenanceConfigurationVariantsSchema
);

const publishSettingsFields = {
    access: z.literal('public'),
    provenance: z.optional(provenanceConfigurationSchema),
    softwareBillOfMaterials: z.optional(softwareBillOfMaterialsSettingsSchema),
    allowScripts: z.optional(z.boolean())
};
const restrictedPublishSettingsFields = {
    access: z.literal('restricted'),
    softwareBillOfMaterials: z.optional(softwareBillOfMaterialsSettingsSchema),
    allowScripts: z.optional(z.boolean())
};
const publishSettingsVariantsSchema = z.discriminatedUnion('access', [
    z.strictObject(publishSettingsFields),
    z.strictObject(restrictedPublishSettingsFields)
]);
export const publishSettingsSchema = z.readonly(publishSettingsVariantsSchema);

export type PublishSettings = z.infer<typeof publishSettingsSchema>;
export type PublicPublishSettings = Extract<PublishSettings, { readonly access: 'public'; }>;
