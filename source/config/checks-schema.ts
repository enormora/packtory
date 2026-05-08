import { z } from 'zod/mini';
import { noDuplicatedFilesRule } from '../checks/rules/no-duplicated-files.ts';

export const checksSchema = z.strictObject({
    noDuplicatedFiles: z.optional(noDuplicatedFilesRule.globalSchema)
});

export const checksPerPackageSchema = z.strictObject({
    noDuplicatedFiles: z.optional(noDuplicatedFilesRule.perPackageSchema)
});
