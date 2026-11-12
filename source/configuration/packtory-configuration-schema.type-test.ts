import type { z } from 'zod/mini';
import { expect, test } from 'tstyche';
import { packtoryConfigurationSchema } from './packtory-configuration-schema.ts';
import type { packtoryConfigurationWithoutRegistrySchema } from './packtory-configuration-without-registry-schema.ts';
import type { registrySettingsSchema } from './registry-settings.ts';

test('preserves configuration schema introspection types', function () {
    expect<(typeof packtoryConfigurationSchema.def.left)['_zod']['config']>().type.toBe<z.core.$strip>();
    expect(packtoryConfigurationSchema.def.right).type.toBe<typeof packtoryConfigurationWithoutRegistrySchema>();
    expect(packtoryConfigurationSchema.def.left.shape.registrySettings.def.innerType).type.toBe<
        typeof registrySettingsSchema
    >();
});
