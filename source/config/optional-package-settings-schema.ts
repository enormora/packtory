import { z } from 'zod/mini';
import { additionalFileDescriptionSchema } from './additional-files.ts';
import { additionalPackageJsonAttributesSchema } from './additional-package-json-attributes-schema.ts';
import { deadCodeEliminationSettingsSchema } from './dead-code-elimination-settings.ts';
import { dependencyPolicySchema } from './dependency-policy.ts';
import { publishSettingsSchema } from './publish-settings.ts';
import { nonEmptyStringSchema } from './base-validations.ts';

export const optionalPackageSettingsSchema = z.strictObject({
    additionalChangelogSourceFiles: z.optional(z.readonly(z.array(nonEmptyStringSchema))),
    additionalFiles: z.optional(z.readonly(z.array(additionalFileDescriptionSchema))),
    includeSourceMapFiles: z.optional(z.boolean()),
    additionalPackageJsonAttributes: z.optional(additionalPackageJsonAttributesSchema),
    publishSettings: z.optional(publishSettingsSchema),
    dependencyPolicy: z.optional(dependencyPolicySchema),
    deadCodeElimination: z.optional(deadCodeEliminationSettingsSchema)
});
