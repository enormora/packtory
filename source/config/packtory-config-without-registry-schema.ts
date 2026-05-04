import { z } from 'zod/mini';
import { checksSchema } from './checks-schema.ts';
import {
    commonPackageSettingsMainPackageJsonRequiredSchema,
    commonPackageSettingsSourcesFolderRequiredSchema,
    optionalCommonPackageSettingsSchema,
    requiredCommonPackageSettingsSchema
} from './common-package-settings-schemas.ts';
import { optionalPackageSettingsSchema } from './optional-package-settings-schema.ts';
import {
    packageSchemaWithAllCommonSettings,
    packageSchemaWithMandatoryMainPackageJson,
    packageSchemaWithMandatorySourcesFolder,
    packageSchemaWithPartialCommonSettings
} from './package-schemas.ts';

const packageConfigWithOptionalCommonPackageSettingsSchema = z.readonly(
    z.object({
        checks: z.optional(checksSchema),
        commonPackageSettings: z.optional(
            z.extend(optionalCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape)
        ),
        packages: z.readonly(z.tuple([packageSchemaWithAllCommonSettings], packageSchemaWithAllCommonSettings))
    })
);

const packageConfigWithRequiredCommonPackageSettingsSchema = z.readonly(
    z.object({
        checks: z.optional(checksSchema),
        commonPackageSettings: z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
        packages: z.readonly(z.tuple([packageSchemaWithPartialCommonSettings], packageSchemaWithPartialCommonSettings))
    })
);

const packageConfigWithRequiredMainPackageJsonSchema = z.readonly(
    z.object({
        checks: z.optional(checksSchema),
        commonPackageSettings: z.extend(
            commonPackageSettingsMainPackageJsonRequiredSchema,
            optionalPackageSettingsSchema.shape
        ),
        packages: z.readonly(
            z.tuple([packageSchemaWithMandatorySourcesFolder], packageSchemaWithMandatorySourcesFolder)
        )
    })
);

const packageConfigWithRequiredSourcesFolderSchema = z.readonly(
    z.object({
        checks: z.optional(checksSchema),
        commonPackageSettings: z.extend(
            commonPackageSettingsSourcesFolderRequiredSchema,
            optionalPackageSettingsSchema.shape
        ),
        packages: z.readonly(
            z.tuple([packageSchemaWithMandatoryMainPackageJson], packageSchemaWithMandatoryMainPackageJson)
        )
    })
);

export const packtoryConfigWithoutRegistrySchema = z.union([
    packageConfigWithOptionalCommonPackageSettingsSchema,
    packageConfigWithRequiredCommonPackageSettingsSchema,
    packageConfigWithRequiredMainPackageJsonSchema,
    packageConfigWithRequiredSourcesFolderSchema
]);
