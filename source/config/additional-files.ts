import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

export const additionalFileDescriptionSchema = z.readonly(
    z.strictObject({
        sourceFilePath: nonEmptyStringSchema,
        targetFilePath: nonEmptyStringSchema
    })
);

export type AdditionalFileDescription = z.infer<typeof additionalFileDescriptionSchema>;
