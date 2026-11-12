import { z } from 'zod/mini';
import { registrySettingsSchema } from './registry-settings.ts';
import { packtoryConfigurationWithoutRegistrySchema } from './packtory-configuration-without-registry-schema.ts';

type PacktoryConfigurationSchema = Readonly<
    z.ZodMiniIntersection<
        z.ZodMiniObject<
            z.util.Writeable<{ readonly registrySettings: z.ZodMiniOptional<typeof registrySettingsSchema>; }>
        >,
        typeof packtoryConfigurationWithoutRegistrySchema
    >
>;

export const packtoryConfigurationSchema: PacktoryConfigurationSchema = z.intersection(
    z.object({
        registrySettings: z.optional(registrySettingsSchema)
    }),
    packtoryConfigurationWithoutRegistrySchema
);
