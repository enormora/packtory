import { z } from 'zod/mini';

export const sbomSettingsSchema = z.readonly(
    z.strictObject({
        enabled: z.optional(z.boolean())
    })
);
