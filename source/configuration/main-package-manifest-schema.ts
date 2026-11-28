import { z } from 'zod/mini';

const stringRecordSchema = z.readonly(z.record(z.string(), z.string()));
const optionalStringRecordSchema = z.optional(stringRecordSchema);
const importsMapSchema = z.readonly(z.record(z.string(), z.json()));
const optionalImportsSchema = z.optional(importsMapSchema);

export const mainPackageManifestSchema = z.readonly(
    z.object({
        type: z.literal('module'),
        dependencies: optionalStringRecordSchema,
        devDependencies: optionalStringRecordSchema,
        peerDependencies: optionalStringRecordSchema,
        imports: optionalImportsSchema
    })
);
