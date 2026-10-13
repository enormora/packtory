import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';
import { mainPackageManifestSchema } from './main-package-manifest-schema.ts';

export const optionalCommonPackageSettingsSchema = z.strictObject({
    sourcesFolder: z.optional(nonEmptyStringSchema),
    mainPackageManifest: z.optional(mainPackageManifestSchema)
});

export const requiredCommonPackageSettingsSchema = z.strictObject({
    sourcesFolder: nonEmptyStringSchema,
    mainPackageManifest: mainPackageManifestSchema
});

export const commonPackageSettingsSourcesFolderRequiredSchema = z.strictObject({
    sourcesFolder: nonEmptyStringSchema,
    mainPackageManifest: z.optional(mainPackageManifestSchema)
});

export const commonPackageSettingsMainPackageManifestRequiredSchema = z.strictObject({
    sourcesFolder: z.optional(nonEmptyStringSchema),
    mainPackageManifest: mainPackageManifestSchema
});
