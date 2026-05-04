import { z } from 'zod/mini';
import {
    commonPackageSettingsMainPackageJsonRequiredSchema,
    commonPackageSettingsSourcesFolderRequiredSchema,
    requiredCommonPackageSettingsSchema
} from './common-package-settings-schemas.ts';
import { optionalPackageSettingsSchema } from './optional-package-settings-schema.ts';
import { perPackageSettingsSchema } from './per-package-settings-schema.ts';

export const packageSchemaWithAllCommonSettings = z.readonly(
    z.extend(
        z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

export const packageSchemaWithPartialCommonSettings = z.readonly(
    z.extend(
        z.extend(z.partial(requiredCommonPackageSettingsSchema), optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

export const packageSchemaWithMandatorySourcesFolder = z.readonly(
    z.extend(
        z.extend(commonPackageSettingsSourcesFolderRequiredSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

export const packageSchemaWithMandatoryMainPackageJson = z.readonly(
    z.extend(
        z.extend(commonPackageSettingsMainPackageJsonRequiredSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);
