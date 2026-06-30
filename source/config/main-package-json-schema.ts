import { z } from 'zod/mini';
import { packageJsonDependencyFieldNames } from './package-json.ts';

const stringRecordSchema = z.readonly(z.record(z.string(), z.string()));
const optionalStringRecordSchema = z.optional(stringRecordSchema);
const optionalImportsSchema = z.optional(z.readonly(z.record(z.string(), z.json())));
const [ dependenciesFieldName, devDependenciesFieldName, peerDependenciesFieldName ] = packageJsonDependencyFieldNames;

export const mainPackageJsonSchema = z.readonly(
    z.object({
        type: z.literal('module'),
        [dependenciesFieldName]: optionalStringRecordSchema,
        [devDependenciesFieldName]: optionalStringRecordSchema,
        [peerDependenciesFieldName]: optionalStringRecordSchema,
        imports: optionalImportsSchema
    })
);
