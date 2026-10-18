import { z } from 'zod/mini';
import {
    commonPackageSettingsMainPackageManifestRequiredSchema,
    commonPackageSettingsSourcesFolderRequiredSchema,
    requiredCommonPackageSettingsSchema
} from './common-package-settings-schemas.ts';
import { optionalPackageSettingsSchema } from './optional-package-settings-schema.ts';
import { perPackageSettingsSchema } from './per-package-settings-schema.ts';

const partialRequiredCommonPackageSettingsSchema = z.partial(requiredCommonPackageSettingsSchema);

export const packageSchemaWithAllCommonSettings = z.readonly(
    z.extend(
        z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

export const packageSchemaWithPartialCommonSettings = z.readonly(
    z.extend(
        z.extend(partialRequiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

export const packageSchemaWithMandatorySourcesFolder = z.readonly(
    z.extend(
        z.extend(commonPackageSettingsSourcesFolderRequiredSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

export const packageSchemaWithMandatoryMainPackageManifest = z.readonly(
    z.extend(
        z.extend(commonPackageSettingsMainPackageManifestRequiredSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);
