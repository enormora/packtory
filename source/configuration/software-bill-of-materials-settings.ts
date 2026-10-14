import { z } from 'zod/mini';

export const softwareBillOfMaterialsSettingsSchema = z.readonly(
    z.strictObject({
        enabled: z.optional(z.boolean())
    })
);
