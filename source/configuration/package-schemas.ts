import { z } from 'zod/mini';
import {
    commonPackageSettingsMainPackageManifestRequiredSchema,
    commonPackageSettingsSourcesFolderRequiredSchema,
    requiredCommonPackageSettingsSchema
} from './common-package-settings-schemas.ts';
import { optionalPackageSettingsSchema } from './optional-package-settings-schema.ts';
import { perPackageSettingsSchema } from './per-package-settings-schema.ts';

type PackageSchema<Common extends z.ZodMiniObject> = Readonly<
    z.ZodMiniReadonly<
        z.ZodMiniObject<
            z.util.Extend<
                z.util.Extend<Common['shape'], z.util.Writeable<typeof optionalPackageSettingsSchema.shape>>,
                z.util.Writeable<typeof perPackageSettingsSchema.shape>
            >,
            Common['_zod']['config']
        >
    >
>;

const partialRequiredCommonPackageSettingsSchema = z.partial(requiredCommonPackageSettingsSchema);

export const packageSchemaWithAllCommonSettings: PackageSchema<typeof requiredCommonPackageSettingsSchema> = z.readonly(
    z.extend(
        z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

export const packageSchemaWithPartialCommonSettings: PackageSchema<typeof partialRequiredCommonPackageSettingsSchema> =
    z.readonly(
        z.extend(
            z.extend(partialRequiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
            perPackageSettingsSchema.shape
        )
    );

export const packageSchemaWithMandatorySourcesFolder: PackageSchema<
    typeof commonPackageSettingsSourcesFolderRequiredSchema
> = z.readonly(
    z.extend(
        z.extend(commonPackageSettingsSourcesFolderRequiredSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

export const packageSchemaWithMandatoryMainPackageManifest: PackageSchema<
    typeof commonPackageSettingsMainPackageManifestRequiredSchema
> = z.readonly(
    z.extend(
        z.extend(commonPackageSettingsMainPackageManifestRequiredSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);
