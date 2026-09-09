import { z } from 'zod/mini';

const stringRecordSchema = z.readonly(z.record(z.string(), z.string()));
const optionalStringRecordSchema = z.optional(stringRecordSchema);
const optionalImportsSchema = z.optional(z.readonly(z.record(z.string(), z.json())));

export const mainPackageJsonSchema = z.readonly(
    z.object({
        type: z.literal('module'),
        dependencies: optionalStringRecordSchema,
        devDependencies: optionalStringRecordSchema,
        peerDependencies: optionalStringRecordSchema,
        imports: optionalImportsSchema
    })
);
