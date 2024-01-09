import {
    type Schema,
    filter,
    struct,
    number,
    boolean,
    array,
    optional,
    literal,
    string,
    record,
    unknown,
    union,
    extend
} from '@effect/schema/Schema';
import type { NoExpand } from './base-validations.js';

const stringRecordSchema = record(string, string);
const optionalStringRecordSchema = optional(stringRecordSchema, { exact: true });

const $mainPackageJsonSchema = struct({
    type: optional(literal('module'), { exact: true }),
    dependencies: optionalStringRecordSchema,
    devDependencies: optionalStringRecordSchema
}).pipe(extend(record(string, unknown)));
export type MainPackageJson = NoExpand<Schema.To<typeof $mainPackageJsonSchema>>;
export const mainPackageJsonSchema: Schema<MainPackageJson> = $mainPackageJsonSchema;

const $attributeValueSchema = union(string, number, boolean, array(unknown), record(string, unknown));
type AttributeValue = NoExpand<Schema.To<typeof $attributeValueSchema>>;
const attributeValueSchema: Schema<AttributeValue> = $attributeValueSchema;

const forbiddenAttributeNames = new Set([
    'dependencies',
    'peerDependencies',
    'main',
    'name',
    'types',
    'type',
    'version'
]);

const $additionalPackageJsonAttributeNameSchema = string.pipe(
    filter(
        (value) => {
            return !forbiddenAttributeNames.has(value);
        },
        {
            message(value) {
                return `the key '${value}' is not allowed`;
            }
        }
    )
);
type AdditionalPackageJsonAttributeName = Schema.To<typeof $additionalPackageJsonAttributeNameSchema>;
const additionalPackageJsonAttributeNameSchema: Schema<AdditionalPackageJsonAttributeName> =
    $additionalPackageJsonAttributeNameSchema;

const $additionalPackageJsonAttributesSchema = record(additionalPackageJsonAttributeNameSchema, attributeValueSchema);
export type AdditionalPackageJsonAttributes = Schema.To<typeof $additionalPackageJsonAttributesSchema>;
export const additionalPackageJsonAttributesSchema: Schema<AdditionalPackageJsonAttributes> =
    $additionalPackageJsonAttributesSchema;
