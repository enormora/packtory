import { z } from 'zod/mini';

const softwareBillOfMaterialsSettingsFields = {
    enabled: z.optional(z.boolean())
};
export const softwareBillOfMaterialsSettingsSchema = z.readonly(
    z.strictObject(softwareBillOfMaterialsSettingsFields)
);
