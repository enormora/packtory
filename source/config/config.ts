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

const foo1 = z.readonly(
    z.extend(
        z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

const configWithOptionalCommonSettingsSchema = z.strictObject({
    registrySettings: registrySettingsSchema,
    commonPackageSettings: z.optional(
        z.extend(optionalCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape)
    ),
    packages: z.readonly(z.tuple([foo1], foo1))
});

const foo2 = z.readonly(
    z.extend(
        z.extend(z.partial(requiredCommonPackageSettingsSchema), optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

const foo3 = z.readonly(
    z.extend(
        z.extend(commonPackageSettingsSourcesFolderRequiredSchema, optionalPackageSettingsSchema.shape),
        perPackageSettingsSchema.shape
    )
);

const foo4 = z.extend(
    z.extend(commonPackageSettingsMainPackageJsonRequiredSchema, optionalPackageSettingsSchema.shape),
    perPackageSettingsSchema.shape
);

export const packtoryConfigSchema = z.union([
    configWithOptionalCommonSettingsSchema,
    z.readonly(
        z.strictObject({
            registrySettings: registrySettingsSchema,
            commonPackageSettings: z.extend(requiredCommonPackageSettingsSchema, optionalPackageSettingsSchema.shape),
            packages: z.readonly(z.tuple([foo2], foo2))
        })
    ),
    z.readonly(
        z.strictObject({
            registrySettings: registrySettingsSchema,
            commonPackageSettings: z.extend(
                commonPackageSettingsMainPackageJsonRequiredSchema,
                optionalPackageSettingsSchema.shape
            ),
            packages: z.readonly(z.tuple([foo3], foo3))
        })
    ),
    z.readonly(
        z.strictObject({
            registrySettings: registrySettingsSchema,
            commonPackageSettings: z.extend(
                commonPackageSettingsSourcesFolderRequiredSchema,
                optionalPackageSettingsSchema.shape
            ),
            packages: z.readonly(z.tuple([foo4], foo4))
        })
    )
]);

export type PacktoryConfig = z.infer<typeof packtoryConfigSchema>;
export type PackageConfig = PacktoryConfig['packages'][number];
