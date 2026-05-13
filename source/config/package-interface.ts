import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

const exportKeySchema = z.string().check(
    z.refine((value) => {
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

const nonEmptyModuleExposuresSchema = z.readonly(z.tuple([moduleExposureSchema], moduleExposureSchema));
const nonEmptyBinExposuresSchema = z.readonly(z.tuple([binExposureSchema], binExposureSchema));

export const packageInterfaceSchema = z.readonly(
    z.union([
        z.strictObject({
            modules: nonEmptyModuleExposuresSchema,
            bins: z.optional(nonEmptyBinExposuresSchema)
        }),
        z.strictObject({
            bins: nonEmptyBinExposuresSchema,
            modules: z.optional(nonEmptyModuleExposuresSchema)
        })
    ])
);

export type PackageInterface = z.infer<typeof packageInterfaceSchema>;
