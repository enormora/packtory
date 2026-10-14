import { z } from 'zod/mini';
import { registrySettingsSchema } from './registry-settings.ts';
import { packtoryConfigurationWithoutRegistrySchema } from './packtory-configuration-without-registry-schema.ts';

export const packtoryConfigurationSchema = z.intersection(
    z.object({
        registrySettings: z.optional(registrySettingsSchema)
    }),
    packtoryConfigurationWithoutRegistrySchema
);
