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
type ConfigurationObjectSchema<Common extends z.ZodMiniType, Package extends z.ZodMiniType> = z.ZodMiniObject<
    z.util.Writeable<
        typeof topLevelSettingsSchemaShape & {
            readonly commonPackageSettings: Common;
            readonly packages: z.ZodMiniReadonly<z.ZodMiniTuple<readonly [Package], Package>>;
        }
    >
>;
type ConfigurationSchema<Common extends z.ZodMiniType, Package extends z.ZodMiniType> = Readonly<
    z.ZodMiniReadonly<ConfigurationObjectSchema<Common, Package>>
>;

function createPackageConfigurationSchema<Common extends z.ZodMiniType, Package extends z.ZodMiniType>(
    commonPackageSettings: Common,
    packageSchema: Package
): ConfigurationObjectSchema<Common, Package> {
    const fields: typeof topLevelSettingsSchemaShape & {
        readonly commonPackageSettings: Common;
        readonly packages: z.ZodMiniReadonly<z.ZodMiniTuple<readonly [Package], Package>>;
    } = {
        ...topLevelSettingsSchemaShape,
        commonPackageSettings,
        packages: z.readonly(z.tuple([ packageSchema ], packageSchema))
    };
    return z.object(fields);
}

const optionalCommonSettingsSchema = z.optional(
    z.extend(optionalCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape)
);

const packageConfigurationWithOptionalCommonPackageSettingsSchema: ConfigurationSchema<
    z.ZodMiniOptional<CommonSettingsSchema<typeof optionalCommonPackageSettingsSchema>>,
    typeof packageSchemaWithAllCommonSettings
> = z.readonly(createPackageConfigurationSchema(
    optionalCommonSettingsSchema,
    packageSchemaWithAllCommonSettings
));

const packageConfigurationWithRequiredCommonPackageSettingsSchema: ConfigurationSchema<
    CommonSettingsSchema<typeof requiredCommonPackageSettingsSchema>,
    typeof packageSchemaWithPartialCommonSettings
> = z.readonly(createPackageConfigurationSchema(
    z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
    packageSchemaWithPartialCommonSettings
));

const packageConfigurationWithRequiredMainPackageManifestSchema: ConfigurationSchema<
    CommonSettingsSchema<typeof commonPackageSettingsMainPackageManifestRequiredSchema>,
    typeof packageSchemaWithMandatorySourcesFolder
> = z.readonly(createPackageConfigurationSchema(
    z.extend(commonPackageSettingsMainPackageManifestRequiredSchema, optionalPackageSettingsSchema.shape),
    packageSchemaWithMandatorySourcesFolder
));

const packageConfigurationWithRequiredSourcesFolderSchema: ConfigurationSchema<
    CommonSettingsSchema<typeof commonPackageSettingsSourcesFolderRequiredSchema>,
    typeof packageSchemaWithMandatoryMainPackageManifest
> = z.readonly(createPackageConfigurationSchema(
    z.extend(commonPackageSettingsSourcesFolderRequiredSchema, optionalPackageSettingsSchema.shape),
    packageSchemaWithMandatoryMainPackageManifest
));

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
