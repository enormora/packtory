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

function createPackageSchema<Common extends z.ZodMiniObject>(commonSettings: Common): PackageSchema<Common> {
    return z.readonly(
        z.extend(z.extend(commonSettings, optionalPackageSettingsSchema.shape), perPackageSettingsSchema.shape)
    );
}

const partialRequiredCommonPackageSettingsSchema = z.partial(requiredCommonPackageSettingsSchema);

export const packageSchemaWithAllCommonSettings: PackageSchema<typeof requiredCommonPackageSettingsSchema> =
    createPackageSchema(requiredCommonPackageSettingsSchema);

export const packageSchemaWithPartialCommonSettings: PackageSchema<typeof partialRequiredCommonPackageSettingsSchema> =
    createPackageSchema(partialRequiredCommonPackageSettingsSchema);

export const packageSchemaWithMandatorySourcesFolder: PackageSchema<
    typeof commonPackageSettingsSourcesFolderRequiredSchema
> = createPackageSchema(commonPackageSettingsSourcesFolderRequiredSchema);

export const packageSchemaWithMandatoryMainPackageManifest: PackageSchema<
    typeof commonPackageSettingsMainPackageManifestRequiredSchema
> = createPackageSchema(commonPackageSettingsMainPackageManifestRequiredSchema);
