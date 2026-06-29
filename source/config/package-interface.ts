import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

const exportKeySchema = z.string().check(
    z.refine(function (value) {
        return value === '.' || value.startsWith('./');
    })
);

const moduleExposureSchema = z.readonly(
    z.strictObject({
        root: nonEmptyStringSchema,
        export: exportKeySchema
    })
);

const binExposureSchema = z.readonly(
    z.strictObject({
        root: nonEmptyStringSchema,
        name: nonEmptyStringSchema
    })
);

const nonEmptyModuleExposuresSchema = z.readonly(z.tuple([ moduleExposureSchema ], moduleExposureSchema));
const nonEmptyBinExposuresSchema = z.readonly(z.tuple([ binExposureSchema ], binExposureSchema));
const nonEmptyPrivateRootsSchema = z.readonly(z.tuple([ nonEmptyStringSchema ], nonEmptyStringSchema));

export const packageInterfaceSchema = z.readonly(
    z
        .strictObject({
            modules: z.optional(nonEmptyModuleExposuresSchema),
            bins: z.optional(nonEmptyBinExposuresSchema),
            privateRoots: z.optional(nonEmptyPrivateRootsSchema)
        })
        .check(
            z.refine(function (value) {
                return value.modules !== undefined || value.bins !== undefined;
            })
        )
);

export type PackageInterface = z.infer<typeof packageInterfaceSchema>;
