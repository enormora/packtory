import { z } from 'zod/mini';
import { packageJsonDependencyFieldNames } from './package-json.ts';

const stringRecordSchema = z.readonly(z.record(z.string(), z.string()));
const optionalStringRecordSchema = z.optional(stringRecordSchema);

export const mainPackageJsonSchema = z.readonly(
    z.object({
        type: z.optional(z.literal('module')),
        [packageJsonDependencyFieldNames[0]]: optionalStringRecordSchema,
        [packageJsonDependencyFieldNames[1]]: optionalStringRecordSchema,
        [packageJsonDependencyFieldNames[2]]: optionalStringRecordSchema
    })
);
