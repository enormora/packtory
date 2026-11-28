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

const topLevelSettingsSchemaShape: {
    readonly changelog: z.ZodMiniOptional<typeof changelogSettingsSchema>;
    readonly checks: z.ZodMiniOptional<typeof checksSchema>;
} = {
    changelog: z.optional(changelogSettingsSchema),
    checks: z.optional(checksSchema)
};

type CommonSettingsSchema<Common extends z.ZodMiniObject> = Readonly<
    z.ZodMiniObject<
        z.util.Extend<Common['shape'], z.util.Writeable<typeof optionalPackageSettingsSchema.shape>>,
        Common['_zod']['config']
    >
>;
type ConfigurationSchema<Common extends z.ZodMiniType, Package extends z.ZodMiniType> = Readonly<
    z.ZodMiniReadonly<
        z.ZodMiniObject<
            z.util.Writeable<
                typeof topLevelSettingsSchemaShape & {
                    readonly commonPackageSettings: Common;
                    readonly packages: z.ZodMiniReadonly<z.ZodMiniTuple<readonly [Package], Package>>;
                }
            >
        >
    >
>;

function createPackageConfigurationFields<Common extends z.ZodMiniType, Package extends z.ZodMiniType>(
    commonPackageSettings: Common,
    packageSchema: Package
): typeof topLevelSettingsSchemaShape & {
    readonly commonPackageSettings: Common;
    readonly packages: z.ZodMiniReadonly<z.ZodMiniTuple<readonly [Package], Package>>;
} {
    return {
        ...topLevelSettingsSchemaShape,
        commonPackageSettings,
        packages: z.readonly(z.tuple([ packageSchema ], packageSchema))
    };
}

const optionalCommonSettingsSchema = z.optional(
    z.extend(optionalCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape)
);
const requiredCommonSettingsSchema = z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape);
const commonSettingsWithMainManifestSchema = z.extend(
    commonPackageSettingsMainPackageManifestRequiredSchema,
    optionalPackageSettingsSchema.shape
);
const commonSettingsWithSourcesFolderSchema = z.extend(
    commonPackageSettingsSourcesFolderRequiredSchema,
    optionalPackageSettingsSchema.shape
);

const packageConfigurationWithOptionalCommonPackageSettingsSchema: ConfigurationSchema<
    z.ZodMiniOptional<CommonSettingsSchema<typeof optionalCommonPackageSettingsSchema>>,
    typeof packageSchemaWithAllCommonSettings
> = z.readonly(
    z.object(createPackageConfigurationFields(optionalCommonSettingsSchema, packageSchemaWithAllCommonSettings))
);

const packageConfigurationWithRequiredCommonPackageSettingsSchema: ConfigurationSchema<
    CommonSettingsSchema<typeof requiredCommonPackageSettingsSchema>,
    typeof packageSchemaWithPartialCommonSettings
> = z.readonly(
    z.object(createPackageConfigurationFields(requiredCommonSettingsSchema, packageSchemaWithPartialCommonSettings))
);

const packageConfigurationWithRequiredMainPackageManifestSchema: ConfigurationSchema<
    CommonSettingsSchema<typeof commonPackageSettingsMainPackageManifestRequiredSchema>,
    typeof packageSchemaWithMandatorySourcesFolder
> = z.readonly(
    z.object(
        createPackageConfigurationFields(commonSettingsWithMainManifestSchema, packageSchemaWithMandatorySourcesFolder)
    )
);

const packageConfigurationWithRequiredSourcesFolderSchema: ConfigurationSchema<
    CommonSettingsSchema<typeof commonPackageSettingsSourcesFolderRequiredSchema>,
    typeof packageSchemaWithMandatoryMainPackageManifest
> = z.readonly(
    z.object(
        createPackageConfigurationFields(
            commonSettingsWithSourcesFolderSchema,
            packageSchemaWithMandatoryMainPackageManifest
        )
    )
);

export const packtoryConfigurationWithoutRegistrySchema: z.ZodMiniUnion<
    readonly [
        typeof packageConfigurationWithOptionalCommonPackageSettingsSchema,
        typeof packageConfigurationWithRequiredCommonPackageSettingsSchema,
        typeof packageConfigurationWithRequiredMainPackageManifestSchema,
        typeof packageConfigurationWithRequiredSourcesFolderSchema
    ]
> = z.union([
    packageConfigurationWithOptionalCommonPackageSettingsSchema,
    packageConfigurationWithRequiredCommonPackageSettingsSchema,
    packageConfigurationWithRequiredMainPackageManifestSchema,
    packageConfigurationWithRequiredSourcesFolderSchema
]);
