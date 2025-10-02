import { z } from 'zod/mini';
import { registrySettingsSchema } from './registry-settings.ts';
import { nonEmptyStringSchema } from './base-validations.ts';
import { versioningSettingsSchema } from './versioning-settings.ts';
import { additionalPackageJsonAttributesSchema, mainPackageJsonSchema } from './package-json.ts';
import { entryPointSchema } from './entry-point.ts';
import { additionalFileDescriptionSchema } from './additional-files.ts';

const perPackageSettingsSchema = z.strictObject({
    name: nonEmptyStringSchema,
    entryPoints: z.readonly(z.tuple([entryPointSchema], entryPointSchema)),
    versioning: z.optional(versioningSettingsSchema),
    bundleDependencies: z.optional(z.readonly(z.array(nonEmptyStringSchema))),
    bundlePeerDependencies: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
});

const optionalCommonPackageSettingsSchema = z.strictObject({
    sourcesFolder: z.optional(nonEmptyStringSchema),
    mainPackageJson: z.optional(mainPackageJsonSchema)
});

const requiredCommonPackageSettingsSchema = z.strictObject({
    sourcesFolder: nonEmptyStringSchema,
    mainPackageJson: mainPackageJsonSchema
});

const commonPackageSettingsSourcesFolderRequiredSchema = z.strictObject({
    sourcesFolder: nonEmptyStringSchema,
    mainPackageJson: z.optional(mainPackageJsonSchema)
});

const commonPackageSettingsMainPackageJsonRequiredSchema = z.strictObject({
    sourcesFolder: z.optional(nonEmptyStringSchema),
    mainPackageJson: mainPackageJsonSchema
});

const optionalPackageSettingsSchema = z.strictObject({
    additionalFiles: z.optional(z.readonly(z.array(additionalFileDescriptionSchema))),
    includeSourceMapFiles: z.optional(z.boolean()),
    additionalPackageJsonAttributes: z.optional(additionalPackageJsonAttributesSchema)
});

const packageSchemaWithAllCommonSettings = z.readonly(
    z.extend(
        z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

const packageSchemaWithPartialCommonSettings = z.readonly(
    z.extend(
        z.extend(z.partial(requiredCommonPackageSettingsSchema), optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

const packageSchemaWithMandatorySourcesFolder = z.readonly(
    z.extend(
        z.extend(commonPackageSettingsSourcesFolderRequiredSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

const packageSchemaWithMandatoryMainPackageJson = z.extend(
    z.extend(commonPackageSettingsMainPackageJsonRequiredSchema, optionalPackageSettingsSchema.shape),
    perPackageSettingsSchema.shape
);

export const packtoryConfigWithoutRegistrySchema = z.union([
    z.object({
        commonPackageSettings: z.optional(
            z.extend(optionalCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape)
        ),
        packages: z.readonly(z.tuple([packageSchemaWithAllCommonSettings], packageSchemaWithAllCommonSettings))
    }),
    z.readonly(
        z.object({
            commonPackageSettings: z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
            packages: z.readonly(
                z.tuple([packageSchemaWithPartialCommonSettings], packageSchemaWithPartialCommonSettings)
            )
        })
    ),
    z.readonly(
        z.object({
            commonPackageSettings: z.extend(
                commonPackageSettingsMainPackageJsonRequiredSchema,
                optionalPackageSettingsSchema.shape
            ),
            packages: z.readonly(
                z.tuple([packageSchemaWithMandatorySourcesFolder], packageSchemaWithMandatorySourcesFolder)
            )
        })
    ),
    z.readonly(
        z.object({
            commonPackageSettings: z.extend(
                commonPackageSettingsSourcesFolderRequiredSchema,
                optionalPackageSettingsSchema.shape
            ),
            packages: z.readonly(
                z.tuple([packageSchemaWithMandatoryMainPackageJson], packageSchemaWithMandatoryMainPackageJson)
            )
        })
    )
]);

export type PacktoryConfigWithoutRegistry = z.infer<typeof packtoryConfigWithoutRegistrySchema>;

export const packtoryConfigSchema = z.intersection(
    z.object({
        registrySettings: registrySettingsSchema
    }),
    packtoryConfigWithoutRegistrySchema
);

export type PacktoryConfig = z.infer<typeof packtoryConfigSchema>;
export type PackageConfig = PacktoryConfig['packages'][number];
