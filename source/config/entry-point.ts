import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

export const entryPointSchema = z.readonly(
    z.strictObject({
        js: nonEmptyStringSchema,
        declarationFile: z.optional(nonEmptyStringSchema)
    })
);
export type EntryPoint = z.infer<typeof entryPointSchema>;
