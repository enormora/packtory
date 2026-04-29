import { z } from 'zod/mini';
import { entryPointSchema } from './entry-point.ts';
import { nonEmptyStringSchema } from './base-validations.ts';
import { versioningSettingsSchema } from './versioning-settings.ts';

export const perPackageSettingsSchema = z.strictObject({
    name: nonEmptyStringSchema,
    entryPoints: z.readonly(z.tuple([entryPointSchema], entryPointSchema)),
    versioning: z.optional(versioningSettingsSchema),
    bundleDependencies: z.optional(z.readonly(z.array(nonEmptyStringSchema))),
    bundlePeerDependencies: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
});
