import { z } from 'zod/mini';
import { changelogSettingsSchema } from './changelog-settings.ts';
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

const topLevelSettingsSchemaShape = {
    changelog: z.optional(changelogSettingsSchema),
    checks: z.optional(checksSchema)
};

const packageConfigWithOptionalCommonPackageSettingsSchema = z.readonly(
    z.object({
        ...topLevelSettingsSchemaShape,
        commonPackageSettings: z.optional(
            z.extend(optionalCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape)
        ),
        packages: z.readonly(z.tuple([packageSchemaWithAllCommonSettings], packageSchemaWithAllCommonSettings))
    })
);

const packageConfigWithRequiredCommonPackageSettingsSchema = z.readonly(
    z.object({
        ...topLevelSettingsSchemaShape,
        commonPackageSettings: z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
        packages: z.readonly(z.tuple([packageSchemaWithPartialCommonSettings], packageSchemaWithPartialCommonSettings))
    })
);

const packageConfigWithRequiredMainPackageJsonSchema = z.readonly(
    z.object({
        ...topLevelSettingsSchemaShape,
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
        ...topLevelSettingsSchemaShape,
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
