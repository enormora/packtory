import { z } from 'zod/mini';
import { noDuplicatedFilesRule } from '../checks/rules/no-duplicated-files.ts';
import { requiredFilesRule } from '../checks/rules/required-files.ts';

export const checksSchema = z.strictObject({
    noDuplicatedFiles: z.optional(noDuplicatedFilesRule.globalSchema),
    requiredFiles: z.optional(requiredFilesRule.globalSchema)
});

export const checksPerPackageSchema = z.strictObject({
    noDuplicatedFiles: z.optional(noDuplicatedFilesRule.perPackageSchema),
    requiredFiles: z.optional(requiredFilesRule.perPackageSchema)
});
