import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.js';

export const registrySettingsSchema = z.readonly(
    z.strictObject({
        registryUrl: z.optional(nonEmptyStringSchema),
        token: nonEmptyStringSchema
    })
);

export type RegistrySettings = z.infer<typeof registrySettingsSchema>;
