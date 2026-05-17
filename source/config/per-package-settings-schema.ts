import { z } from 'zod/mini';
import { checksPerPackageSchema } from './checks-schema.ts';
import { nonEmptyStringSchema } from './base-validations.ts';
import { packageInterfaceSchema } from './package-interface.ts';
import { rootSchema } from './root.ts';
import { versioningSettingsSchema } from './versioning-settings.ts';

const rootsSchema = z.readonly(z.record(nonEmptyStringSchema, rootSchema));

const basePerPackageSettingsShape = {
    name: nonEmptyStringSchema,
    exportPackageJson: z.optional(z.literal(true)),
    versioning: z.optional(versioningSettingsSchema),
    bundleDependencies: z.optional(z.readonly(z.array(nonEmptyStringSchema))),
    bundlePeerDependencies: z.optional(z.readonly(z.array(nonEmptyStringSchema))),
    checks: z.optional(checksPerPackageSchema)
} as const;

const perPackageSettingsShape = {
    ...basePerPackageSettingsShape,
    roots: rootsSchema,
    defaultModuleRoot: z.optional(nonEmptyStringSchema),
    packageInterface: z.optional(packageInterfaceSchema)
} as const;

export const perPackageSettingsSchema = z.strictObject(perPackageSettingsShape);
