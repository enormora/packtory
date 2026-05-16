import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

export const rootSchema = z.readonly(
    z.strictObject({
        js: nonEmptyStringSchema,
        declarationFile: z.optional(nonEmptyStringSchema)
    })
);

export type Root = z.infer<typeof rootSchema>;
