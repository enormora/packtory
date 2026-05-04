import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

export const manualVersioningSettingsSchema = z.readonly(
    z.strictObject({
        automatic: z.literal(false),
        version: nonEmptyStringSchema
    })
);
