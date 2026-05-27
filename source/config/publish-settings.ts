import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';
import { sbomSettingsSchema } from './sbom-settings.ts';

export const provenanceType = {
    auto: 'auto',
    file: 'file'
} as const;

export const publishAccess = {
    public: 'public',
    restricted: 'restricted'
} as const;

const provenanceConfigSchema = z.readonly(
    z.discriminatedUnion('type', [
        z.strictObject({
            type: z.literal(provenanceType.auto)
        }),
        z.strictObject({
            type: z.literal(provenanceType.file),
            path: nonEmptyStringSchema
        })
    ])
);

export const publishSettingsSchema = z.readonly(
    z.discriminatedUnion('access', [
        z.strictObject({
            access: z.literal(publishAccess.public),
            provenance: z.optional(provenanceConfigSchema),
            sbom: z.optional(sbomSettingsSchema),
            allowScripts: z.optional(z.boolean())
        }),
        z.strictObject({
            access: z.literal(publishAccess.restricted),
            sbom: z.optional(sbomSettingsSchema),
            allowScripts: z.optional(z.boolean())
        })
    ])
);

export type PublishSettings = z.infer<typeof publishSettingsSchema>;
export type PublicPublishSettings = Extract<PublishSettings, { access: typeof publishAccess.public }>;
