import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';
import { mainPackageJsonSchema } from './main-package-json-schema.ts';

export const optionalCommonPackageSettingsSchema = z.strictObject({
    sourcesFolder: z.optional(nonEmptyStringSchema),
    mainPackageJson: z.optional(mainPackageJsonSchema)
});

export const requiredCommonPackageSettingsSchema = z.strictObject({
    sourcesFolder: nonEmptyStringSchema,
    mainPackageJson: mainPackageJsonSchema
});

export const commonPackageSettingsSourcesFolderRequiredSchema = z.strictObject({
    sourcesFolder: nonEmptyStringSchema,
    mainPackageJson: z.optional(mainPackageJsonSchema)
});

export const commonPackageSettingsMainPackageJsonRequiredSchema = z.strictObject({
    sourcesFolder: z.optional(nonEmptyStringSchema),
    mainPackageJson: mainPackageJsonSchema
});
