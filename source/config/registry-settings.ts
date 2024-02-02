import { type Schema, struct, optional } from '@effect/schema/Schema';
import { type NoExpand, nonEmptyStringSchema } from './base-validations.js';

const $registrySettingsSchema = struct({
    registryUrl: optional(nonEmptyStringSchema, { exact: true }),
    token: nonEmptyStringSchema
});

export type RegistrySettings = NoExpand<Schema.To<typeof $registrySettingsSchema>>;
export const registrySettingsSchema: Schema<RegistrySettings> = $registrySettingsSchema;
