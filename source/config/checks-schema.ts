import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

const noDuplicatedFilesSettingsSchema = z.strictObject({
    enabled: z.boolean(),
    allowList: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
});

export const checksSchema = z.strictObject({
    noDuplicatedFiles: z.optional(noDuplicatedFilesSettingsSchema)
});
