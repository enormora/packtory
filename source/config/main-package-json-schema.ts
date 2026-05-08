import { z } from 'zod/mini';
import { packageJsonDependencyFieldNames } from './package-json.ts';

const stringRecordSchema = z.readonly(z.record(z.string(), z.string()));
const optionalStringRecordSchema = z.optional(stringRecordSchema);
const [dependenciesFieldName, devDependenciesFieldName, peerDependenciesFieldName] = packageJsonDependencyFieldNames;

export const mainPackageJsonSchema = z.readonly(
    z.object({
        type: z.literal('module'),
        [dependenciesFieldName]: optionalStringRecordSchema,
        [devDependenciesFieldName]: optionalStringRecordSchema,
        [peerDependenciesFieldName]: optionalStringRecordSchema
    })
);
