import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

const minScopedEntryPackages = 2;

const scopedAllowListEntrySchema = z.strictObject({
    filePath: nonEmptyStringSchema,
    packages: z.readonly(z.array(nonEmptyStringSchema).check(z.minLength(minScopedEntryPackages)))
});

const allowListEntrySchema = z.union([nonEmptyStringSchema, scopedAllowListEntrySchema]);

const noDuplicatedFilesSettingsSchema = z.strictObject({
    enabled: z.boolean(),
    allowList: z.optional(z.readonly(z.array(allowListEntrySchema)))
});

export const checksSchema = z.strictObject({
    noDuplicatedFiles: z.optional(noDuplicatedFilesSettingsSchema)
});
