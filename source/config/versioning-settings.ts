import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

const automaticVersioningSettingsSchema = z.readonly(
    z.strictObject({
        automatic: z.literal(true),
        minimumVersion: z.optional(nonEmptyStringSchema)
    })
);

const manualVersioningSettingsSchema = z.readonly(
    z.strictObject({
        automatic: z.literal(false),
        version: nonEmptyStringSchema
    })
);

export const versioningSettingsSchema = z.readonly(
    z.discriminatedUnion('automatic', [automaticVersioningSettingsSchema, manualVersioningSettingsSchema])
);
export type VersioningSettings = z.infer<typeof versioningSettingsSchema>;
