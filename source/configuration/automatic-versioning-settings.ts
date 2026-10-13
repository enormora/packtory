import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

export const automaticVersioningSettingsSchema = z.readonly(
    z.strictObject({
        automatic: z.literal(true),
        minimumVersion: z.optional(nonEmptyStringSchema)
    })
);
