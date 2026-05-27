import { z } from 'zod/mini';
import { registrySettingsSchema } from './registry-settings.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';

export const packtoryConfigSchema = z.intersection(
    z.object({
        registrySettings: z.optional(registrySettingsSchema)
    }),
    packtoryConfigWithoutRegistrySchema
);
