import { z } from 'zod/mini';

const stringRecordSchema = z.readonly(z.record(z.string(), z.string()));
const optionalStringRecordSchema = z.optional(stringRecordSchema);

export const mainPackageJsonSchema = z.readonly(
    z.object({
        type: z.optional(z.literal('module')),
        dependencies: optionalStringRecordSchema,
        devDependencies: optionalStringRecordSchema,
        peerDependencies: optionalStringRecordSchema
    })
);
export type MainPackageJson = z.infer<typeof mainPackageJsonSchema>;

const attributeValueSchema = z.json();

const forbiddenAttributeNames = new Set([
    'dependencies',
    'peerDependencies',
    'devDependencies',
    'main',
    'name',
    'types',
    'type',
    'version'
]);

const additionalPackageJsonAttributeNameSchema = z.string().check(
    z.refine((value) => {
        return !forbiddenAttributeNames.has(value);
    })
);

export const additionalPackageJsonAttributesSchema = z.readonly(
    z.record(additionalPackageJsonAttributeNameSchema, attributeValueSchema)
);
export type AdditionalPackageJsonAttributes = z.infer<typeof additionalPackageJsonAttributesSchema>;
