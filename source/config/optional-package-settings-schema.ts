import { z } from 'zod/mini';
import { additionalFileDescriptionSchema } from './additional-files.ts';
import { additionalPackageJsonAttributesSchema } from './additional-package-json-attributes-schema.ts';
import { publishSettingsSchema } from './publish-settings.ts';

export const optionalPackageSettingsSchema = z.strictObject({
    additionalFiles: z.optional(z.readonly(z.array(additionalFileDescriptionSchema))),
    includeSourceMapFiles: z.optional(z.boolean()),
    additionalPackageJsonAttributes: z.optional(additionalPackageJsonAttributesSchema),
    publishSettings: z.optional(publishSettingsSchema)
});
