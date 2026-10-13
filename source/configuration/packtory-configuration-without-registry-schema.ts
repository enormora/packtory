import { z } from 'zod/mini';
import { changelogSettingsSchema } from './changelog-settings.ts';
import { checksSchema } from './checks-schema.ts';
import {
    commonPackageSettingsMainPackageManifestRequiredSchema,
    commonPackageSettingsSourcesFolderRequiredSchema,
    optionalCommonPackageSettingsSchema,
    requiredCommonPackageSettingsSchema
} from './common-package-settings-schemas.ts';
import { optionalPackageSettingsSchema } from './optional-package-settings-schema.ts';
import {
    packageSchemaWithAllCommonSettings,
    packageSchemaWithMandatoryMainPackageManifest,
    packageSchemaWithMandatorySourcesFolder,
    packageSchemaWithPartialCommonSettings
} from './package-schemas.ts';

const topLevelSettingsSchemaShape = {
    changelog: z.optional(changelogSettingsSchema),
    checks: z.optional(checksSchema)
};

const packageConfigurationWithOptionalCommonPackageSettingsSchema = z.readonly(
    z.object({
        ...topLevelSettingsSchemaShape,
        commonPackageSettings: z.optional(
            z.extend(optionalCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape)
        ),
        packages: z.readonly(z.tuple([ packageSchemaWithAllCommonSettings ], packageSchemaWithAllCommonSettings))
    })
);

const packageConfigurationWithRequiredCommonPackageSettingsSchema = z.readonly(
    z.object({
        ...topLevelSettingsSchemaShape,
        commonPackageSettings: z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
        packages: z.readonly(
            z.tuple([ packageSchemaWithPartialCommonSettings ], packageSchemaWithPartialCommonSettings)
        )
    })
);

const packageConfigurationWithRequiredMainPackageManifestSchema = z.readonly(
    z.object({
        ...topLevelSettingsSchemaShape,
        commonPackageSettings: z.extend(
            commonPackageSettingsMainPackageManifestRequiredSchema,
            optionalPackageSettingsSchema.shape
        ),
        packages: z.readonly(
            z.tuple([ packageSchemaWithMandatorySourcesFolder ], packageSchemaWithMandatorySourcesFolder)
        )
    })
);

const packageConfigurationWithRequiredSourcesFolderSchema = z.readonly(
    z.object({
        ...topLevelSettingsSchemaShape,
        commonPackageSettings: z.extend(
            commonPackageSettingsSourcesFolderRequiredSchema,
            optionalPackageSettingsSchema.shape
        ),
        packages: z.readonly(
            z.tuple([ packageSchemaWithMandatoryMainPackageManifest ], packageSchemaWithMandatoryMainPackageManifest)
        )
    })
);

export const packtoryConfigurationWithoutRegistrySchema = z.union([
    packageConfigurationWithOptionalCommonPackageSettingsSchema,
    packageConfigurationWithRequiredCommonPackageSettingsSchema,
    packageConfigurationWithRequiredMainPackageManifestSchema,
    packageConfigurationWithRequiredSourcesFolderSchema
]);
