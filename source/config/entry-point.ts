import { type Schema, struct, optional } from '@effect/schema/Schema';
import { nonEmptyStringSchema, type NoExpand } from './base-validations.js';

const $entryPointSchema = struct({
    js: nonEmptyStringSchema,
    declarationFile: optional(nonEmptyStringSchema, { exact: true })
});
export type EntryPoint = NoExpand<Schema.To<typeof $entryPointSchema>>;
export const entryPointSchema: Schema<EntryPoint> = $entryPointSchema;
