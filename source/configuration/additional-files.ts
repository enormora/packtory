import { z } from 'zod/mini';
import { bundleRelativePathSchema, nonEmptyStringSchema } from './base-validations.ts';

export const additionalFileDescriptionSchema = z.readonly(
    z.strictObject({
        inputFilePath: nonEmptyStringSchema,
        targetFilePath: bundleRelativePathSchema
    })
);

export type AdditionalFileDescription = z.infer<typeof additionalFileDescriptionSchema>;
