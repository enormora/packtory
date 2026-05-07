import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

const provenanceConfigSchema = z.readonly(
    z.discriminatedUnion('type', [
        z.strictObject({
            type: z.literal('auto')
        }),
        z.strictObject({
            type: z.literal('file'),
            path: nonEmptyStringSchema
        })
    ])
);

export const publishSettingsSchema = z.readonly(
    z.discriminatedUnion('access', [
        z.strictObject({
            access: z.literal('public'),
            provenance: z.optional(provenanceConfigSchema)
        }),
        z.strictObject({
            access: z.literal('restricted')
        })
    ])
);

export type ProvenanceConfig = z.infer<typeof provenanceConfigSchema>;
export type PublishSettings = z.infer<typeof publishSettingsSchema>;
