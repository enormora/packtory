import {
    boolean,
    union,
    optional,
    struct,
    array,
    tuple,
    nonEmptyArray,
    rest,
    type Schema,
    undefined as undefined_,
    partial,
    extend
} from '@effect/schema/Schema';
import { registrySettingsSchema } from './registry-settings.js';
import { type NoExpand, nonEmptyStringSchema } from './base-validations.js';
import { versioningSettingsSchema } from './versioning-settings.js';
import { additionalPackageJsonAttributesSchema, mainPackageJsonSchema } from './package-json.js';
import { entryPointSchema } from './entry-point.js';
import { additionalFileDescriptionSchema } from './additional-files.js';

const $perPackageSettingsSchema = struct({
    name: nonEmptyStringSchema,
    entryPoints: tuple(entryPointSchema).pipe(rest(entryPointSchema)),
    versioning: optional(versioningSettingsSchema, { exact: true }),
    bundleDependencies: optional(array(nonEmptyStringSchema), { exact: true }),
    bundlePeerDependencies: optional(array(nonEmptyStringSchema), { exact: true })
});
type PerPackageSettings = Schema.To<typeof $perPackageSettingsSchema>;
const perPackageSettingsSchema: Schema<PerPackageSettings> = $perPackageSettingsSchema;

const requiredCommonPackageSettingsSchema = struct({
    sourcesFolder: nonEmptyStringSchema,
    mainPackageJson: mainPackageJsonSchema
});

const commonPackageSettingsSourcesFolderRequiredSchema = struct({
    sourcesFolder: nonEmptyStringSchema,
    mainPackageJson: optional(mainPackageJsonSchema, { exact: true })
});

const commonPackageSettingsMainPackageJsonRequiredSchema = struct({
    sourcesFolder: optional(nonEmptyStringSchema, { exact: true }),
    mainPackageJson: mainPackageJsonSchema
});

const optionalPackageSettingsSchema = struct({
    additionalFiles: optional(array(additionalFileDescriptionSchema), { exact: true }),
    includeSourceMapFiles: optional(boolean, { exact: true }),
    additionalPackageJsonAttributes: optional(additionalPackageJsonAttributesSchema, { exact: true })
});

const configWithOptionalCommonSettingsSchema = struct({
    registrySettings: registrySettingsSchema,
    commonPackageSettings: optional(undefined_, { exact: true }),
    packages: nonEmptyArray(
        requiredCommonPackageSettingsSchema
            .pipe(extend(optionalPackageSettingsSchema))
            .pipe(extend(perPackageSettingsSchema))
    )
});

export const packtoryConfigSchema = union(
    configWithOptionalCommonSettingsSchema,
    struct({
        registrySettings: registrySettingsSchema,
        commonPackageSettings: requiredCommonPackageSettingsSchema.pipe(extend(optionalPackageSettingsSchema)),
        packages: nonEmptyArray(
            partial(requiredCommonPackageSettingsSchema)
                .pipe(extend(optionalPackageSettingsSchema))
                .pipe(extend(perPackageSettingsSchema))
        )
    }),
    struct({
        registrySettings: registrySettingsSchema,
        commonPackageSettings: commonPackageSettingsMainPackageJsonRequiredSchema.pipe(
            extend(optionalPackageSettingsSchema)
        ),
        packages: nonEmptyArray(
            commonPackageSettingsSourcesFolderRequiredSchema
                .pipe(extend(optionalPackageSettingsSchema))
                .pipe(extend(perPackageSettingsSchema))
        )
    }),
    struct({
        registrySettings: registrySettingsSchema,
        commonPackageSettings: commonPackageSettingsSourcesFolderRequiredSchema.pipe(
            extend(optionalPackageSettingsSchema)
        ),
        packages: nonEmptyArray(
            commonPackageSettingsMainPackageJsonRequiredSchema
                .pipe(extend(optionalPackageSettingsSchema))
                .pipe(extend(perPackageSettingsSchema))
        )
    })
);

export type PacktoryConfig = NoExpand<Schema.To<typeof packtoryConfigSchema>>;
export type PackageConfig = PacktoryConfig['packages'][number];
